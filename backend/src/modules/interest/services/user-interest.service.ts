import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { TopicService } from './topic.service';
import { UserInterest } from '../entities/user-interest.entity';
import {
  MAX_SELECTABLE_TOPIC_COUNT,
  MIN_SELECTABLE_TOPIC_COUNT,
} from '../interest.constant';
import { UserInterestSource } from '../interest.enum';
import {
  InterestSummaryView,
  UserInterestSelectionView,
} from '../interest.types';
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
  private readonly logger = new Logger(UserInterestService.name);

  constructor(
    private readonly userInterestRepository: UserInterestRepository,
    private readonly topicService: TopicService,
    private readonly dataSource: DataSource,
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

  /**
   * interest-management-api.md 4.2 — 관심사 관리 화면의 현재 선택 상태.
   *
   * **숨겨진 주제(`is_visible = false`)의 활성 관심사는 제외한다.** 칩으로 그릴 수 없는
   * 선택지를 내려줘도 화면이 할 수 있는 일이 없고, 저장(4.3)의 diff·개수 판정 범위와 응답
   * 범위가 같아야 "조회한 것을 고쳐서 되돌려보낸다"는 계약이 성립한다. 행 자체는 그대로
   * 남으며 관리자가 다시 노출하면 되살아난다(`interest-management.md` 7장).
   */
  async findEditableSelection(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserInterestSelectionView[]> {
    const active = await this.userInterestRepository.findAllActiveByUserId(
      userId,
      manager,
    );
    const visibleTopicIds = await this.findVisibleTopicIdSet(
      active.map((interest) => interest.topicId),
      manager,
    );

    return active
      .filter((interest) => visibleTopicIds.has(interest.topicId))
      .map((interest) => ({
        topicId: interest.topicId,
        source: interest.source,
      }));
  }

  /**
   * interest-management-api.md 4.3 — 관심사 일괄 저장(FR-05). **최종 목록 전체를 받아
   * 전체 교체**하며, 하나의 트랜잭션에서 수행한다(부분 반영 금지 — `interest-management.md` 7장).
   *
   * 온보딩 저장(`replaceOnboardingSelection`)과 다른 점:
   * - 상한이 상수 3이 아니라 **max(3, 저장 전 활성 개수)** 다 — 초과 보유자에게 강제 축소를
   *   요구하지 않는다(`interest-management.md` 7장). 에러 코드도 `INTEREST_*`로 갈린다.
   * - diff 범위를 **노출 중인 주제로 한정한다.** 숨겨진 주제의 활성 행은 요청 목록에 없어도
   *   해제로 처리하지 않는다 — 화면이 그 주제를 목록에 담을 방법이 없고, 여기서 내리면
   *   사용자가 하지 않은 해제(`is_user_removed`)가 자동 확장 영구 제외로 기록된다.
   * - 해제분에 `is_user_removed = true`를 세운다(직접 해제 — 자동 확장 재추가 금지).
   *   재선택(추가분의 기존 행 복원)은 `is_user_removed = false`로 되돌린다.
   * - `onboarding_step`을 건드리지 않는다 — 두 저장이 분리된 이유가 그 부수 효과다.
   */
  async replaceManagedSelection(
    userId: string,
    topicIds: string[],
    now: Date,
  ): Promise<UserInterestSelectionView[]> {
    return this.dataSource.transaction(async (manager) => {
      // 검증 순서는 하한 → 주제 유효성 → 상한 (interest-management-api.md 4.3)
      this.assertManagedShape(topicIds);
      await this.assertTopicsAvailable(topicIds, manager);

      const existing = await this.userInterestRepository.findAllByUserId(
        userId,
        manager,
      );
      const activeRows = existing.filter((interest) => interest.isActive);
      const visibleTopicIds = await this.findVisibleTopicIdSet(
        activeRows.map((interest) => interest.topicId),
        manager,
      );
      const editable = activeRows.filter((interest) =>
        visibleTopicIds.has(interest.topicId),
      );

      // "저장 전 활성 개수"는 diff 범위와 같은 기준으로 센다 — 판정 분모와 요청 목록의
      // 재료가 같아야 "늘었는가"가 성립한다 (interest-management-api.md 4.3)
      const allowedMax = Math.max(MAX_SELECTABLE_TOPIC_COUNT, editable.length);
      if (topicIds.length > allowedMax) {
        throw new BusinessException({
          status: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.INTEREST_LIMIT_EXCEEDED,
          message: `관심 주제는 ${MAX_SELECTABLE_TOPIC_COUNT}개까지 선택할 수 있어요`,
        });
      }

      const requested = new Set(topicIds);
      const editableByTopicId = new Map(
        editable.map((interest) => [interest.topicId, interest]),
      );
      const existingByTopicId = new Map(
        existing.map((interest) => [interest.topicId, interest]),
      );
      const changed: UserInterest[] = [];
      const addedTopicIds: string[] = [];
      const removedTopicIds: string[] = [];

      for (const topicId of topicIds) {
        // 유지분은 건드리지 않는다 — `auto_expand`로 들어온 주제를 해제하지 않고 저장했다고
        // 해서 "직접 고른 것"이 되지 않는다 (interest-management-api.md 4.3)
        if (editableByTopicId.has(topicId)) {
          continue;
        }

        addedTopicIds.push(topicId);
        const found = existingByTopicId.get(topicId);

        if (found) {
          found.source = UserInterestSource.MANUAL;
          found.isActive = true;
          found.isUserRemoved = false;
          found.deactivatedAt = null;
          changed.push(found);
          continue;
        }

        changed.push(
          this.userInterestRepository.create({
            userId,
            topicId,
            source: UserInterestSource.MANUAL,
            isActive: true,
            isUserRemoved: false,
            deactivatedAt: null,
          }),
        );
      }

      for (const interest of editable) {
        if (requested.has(interest.topicId)) {
          continue;
        }

        removedTopicIds.push(interest.topicId);
        interest.isActive = false;
        interest.isUserRemoved = true;
        interest.deactivatedAt = now;
        changed.push(interest);
      }

      if (changed.length > 0) {
        await this.userInterestRepository.saveAll(changed, manager);

        // InterestChangeLog는 테이블이 아니라 구조화 로그다 (domain.md 13.3).
        // 추천·편성 캐시 무효화(4.3 6번)는 현 구현에 무효화할 캐시 실체가 없다 —
        // 탐색 랭킹은 조회 시점에 `user_interests`를 읽고("다음 조회부터 즉시"가 그대로
        // 성립), 드립 편성 배치도 실행 시점에 읽는다. 캐시가 도입되면 여기서 무효화한다.
        this.logger.log('user interests replaced', {
          userId,
          addedCount: addedTopicIds.length,
          removedCount: removedTopicIds.length,
          addedTopicIds,
          removedTopicIds,
        });
      }

      // 저장 후의 최종 상태를 조회(4.2)와 같은 모양으로 되돌린다
      return topicIds.map((topicId) => ({
        topicId,
        source:
          editableByTopicId.get(topicId)?.source ?? UserInterestSource.MANUAL,
      }));
    });
  }

  /** 활성 관심사 중 칩으로 그릴 수 있는(노출 중인) 주제 집합 */
  private async findVisibleTopicIdSet(
    topicIds: string[],
    manager?: EntityManager,
  ): Promise<Set<string>> {
    if (topicIds.length === 0) {
      return new Set();
    }

    const topics = await this.topicService.findAllByIds(topicIds, manager);
    return new Set(
      topics.filter((topic) => topic.isVisible).map((topic) => topic.id),
    );
  }

  private assertManagedShape(topicIds: string[]): void {
    if (topicIds.length < MIN_SELECTABLE_TOPIC_COUNT) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.INTEREST_REQUIRED,
        message: '관심 주제를 1개 이상 선택해주세요',
      });
    }

    if (new Set(topicIds).size !== topicIds.length) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.VALIDATION_FAILED,
        message: '같은 주제를 두 번 선택할 수 없어요',
      });
    }
  }

  private async assertTopicsAvailable(
    topicIds: string[],
    manager?: EntityManager,
  ): Promise<void> {
    const unavailable = await this.topicService.findUnavailableTopicIds(
      topicIds,
      manager,
    );

    if (unavailable.length > 0) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.INTEREST_TOPIC_UNAVAILABLE,
        message: '선택할 수 없는 주제가 포함돼 있어요',
      });
    }
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
