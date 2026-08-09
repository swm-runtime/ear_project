import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { TopicService } from './topic.service';
import { UserInterest } from '../entities/user-interest.entity';
import {
  MAX_SELECTABLE_TOPIC_COUNT,
  MIN_SELECTABLE_TOPIC_COUNT,
} from '../interest.constant';
import { UserInterestSource } from '../interest.enum';
import { InterestSummaryView } from '../interest.types';
import { UserInterestRepository } from '../repositories/user-interest.repository';

/**
 * `user_interests`는 interest 모듈 소유다(domain.md 2장).
 *
 * 온보딩 전용 메서드를 여기에 두는 이유: 개수 상한 판정은 도메인 규칙이므로 Service가
 * 소유해야 한다(architecture.md 3.3 — Orchestrator는 판정하지 않는다).
 * 관심사 편집(FR-05)은 같은 상한을 쓰되 에러 코드가 다르므로 별도 메서드로 추가한다.
 */
@Injectable()
export class UserInterestService {
  constructor(
    private readonly userInterestRepository: UserInterestRepository,
    private readonly topicService: TopicService,
  ) {}

  async findAllActive(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserInterest[]> {
    return this.userInterestRepository.findAllActiveByUserId(userId, manager);
  }

  /**
   * 관심 주제 요약 — **프로필·설정이 같은 함수를 호출한다**(`profile-api.md` 4.1 ·
   * `settings-api.md` 4.1). 화면마다 조립하면 같은 사용자에게 다른 개수·다른 순서가 나간다.
   *
   * **숨김 처리된 관심 주제도 개수에 포함한다** — 편집 화면과 같은 기준을 써야 개수가 어긋나지
   * 않는다(`interest-management.md` 7장). 그래서 노출 주제 목록이 아니라 `findAllByIds`로
   * 이름을 붙인다.
   *
   * 정렬은 `findAllActive`가 주는 **선택한 순서**(`created_at`)를 그대로 쓴다 — 탐색 칩과 같은
   * 규칙이다(`explore-api.md` 4.2-2). `topTopics`는 별도 선정 기준 없이 앞 3개다.
   */
  async buildSummary(
    userId: string,
    topTopicLimit: number,
    manager?: EntityManager,
  ): Promise<InterestSummaryView> {
    const interests = await this.findAllActive(userId, manager);
    const topics = await this.topicService.findAllByIds(
      interests.map((interest) => interest.topicId),
      manager,
    );
    const byId = new Map(topics.map((topic) => [topic.id, topic]));

    const named = interests
      .map((interest) => byId.get(interest.topicId))
      .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic));

    return {
      // 이름을 못 붙인 주제도 사용자가 고른 것이므로 개수에서 빼지 않는다
      count: interests.length,
      topTopics: named
        .slice(0, topTopicLimit)
        .map((topic) => ({ id: topic.id, name: topic.name })),
    };
  }

  async findActiveTopicIds(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const interests = await this.findAllActive(userId, manager);
    return interests.map((interest) => interest.topicId);
  }

  async hasActiveInterest(
    userId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const interests = await this.findAllActive(userId, manager);
    return interests.length > 0;
  }

  /**
   * onboarding-api.md 4.3 — 선택한 주제 집합을 **전체 교체**한다.
   *
   * - 상한·하한을 서버가 다시 검증한다. 클라이언트의 칩 비활성화는 우회된다(onboarding.md 8).
   * - **초과분을 잘라내고 성공시키지 않는다.** 화면에 그려진 선택과 서버 상태가 어긋나면
   *   사용자는 자기가 고른 주제가 왜 빠졌는지 알 수 없다.
   * - **행을 물리 삭제하지 않는다.** 유니크 제약 때문에 재선택 시 같은 행을 되살려야 하고,
   *   `is_user_removed`가 지워지면 안 된다.
   */
  async replaceOnboardingSelection(
    userId: string,
    topicIds: string[],
    now: Date,
    manager?: EntityManager,
  ): Promise<string[]> {
    await this.assertSelectable(topicIds, manager);

    const existing = await this.userInterestRepository.findAllByUserId(
      userId,
      manager,
    );
    const existingByTopicId = new Map(
      existing.map((interest) => [interest.topicId, interest]),
    );
    const selected = new Set(topicIds);
    const changed: UserInterest[] = [];

    // 이번 요청에 없는 기존 온보딩 선택은 내린다 (물리 삭제하지 않는다)
    for (const interest of existing) {
      if (
        !selected.has(interest.topicId) &&
        interest.source === UserInterestSource.ONBOARDING &&
        interest.isActive
      ) {
        interest.isActive = false;
        interest.deactivatedAt = now;
        changed.push(interest);
      }
    }

    for (const topicId of topicIds) {
      const found = existingByTopicId.get(topicId);

      if (found) {
        found.source = UserInterestSource.ONBOARDING;
        found.isActive = true;
        found.deactivatedAt = null;
        // `is_user_removed`는 건드리지 않는다 — 온보딩의 선택 해제와 의미가 다르다
        changed.push(found);
        continue;
      }

      changed.push(
        this.userInterestRepository.create({
          userId,
          topicId,
          source: UserInterestSource.ONBOARDING,
          isActive: true,
          isUserRemoved: false,
          deactivatedAt: null,
        }),
      );
    }

    await this.userInterestRepository.saveAll(changed, manager);

    return topicIds;
  }

  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.userInterestRepository.deleteByUserId(userId, manager);
  }

  private async assertSelectable(
    topicIds: string[],
    manager?: EntityManager,
  ): Promise<void> {
    if (topicIds.length < MIN_SELECTABLE_TOPIC_COUNT) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.ONBOARDING_INTEREST_REQUIRED,
        message: '관심 주제를 1개 이상 선택해주세요',
      });
    }

    if (topicIds.length > MAX_SELECTABLE_TOPIC_COUNT) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.ONBOARDING_INTEREST_LIMIT_EXCEEDED,
        message: `관심 주제는 ${MAX_SELECTABLE_TOPIC_COUNT}개까지 선택할 수 있어요`,
      });
    }

    if (new Set(topicIds).size !== topicIds.length) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.VALIDATION_FAILED,
        message: '같은 주제를 두 번 선택할 수 없어요',
      });
    }

    const unavailable = await this.topicService.findUnavailableTopicIds(
      topicIds,
      manager,
    );

    if (unavailable.length > 0) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.ONBOARDING_TOPIC_UNAVAILABLE,
        message: '선택할 수 없는 주제가 포함돼 있어요',
      });
    }
  }
}
