import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { Topic } from '../entities/topic.entity';
import {
  MAX_SELECTABLE_TOPIC_COUNT,
  RELATED_TOPIC_SIMILARITY_THRESHOLD,
} from '../interest.constant';
import {
  CreateTopicCommand,
  TopicListResult,
  UpdateTopicCommand,
} from '../interest.types';
import { TopicRepository } from '../repositories/topic.repository';

/**
 * `topics`는 interest 모듈 소유다(domain.md 2장).
 * 다른 모듈은 Repository를 직접 주입받지 않고 이 Service만 호출한다(architecture.md 4.3).
 */
@Injectable()
export class TopicService {
  private readonly logger = new Logger(TopicService.name);

  constructor(private readonly topicRepository: TopicRepository) {}

  /**
   * onboarding-api.md 4.2 — 1단계에 노출할 목록. **`is_visible`인 것만 내려준다.**
   *
   * 종전에는 노출 주제가 0건이면 `is_visible`을 무시하고 전체를 폴백으로 내려줬다.
   * **그 목록은 저장할 수 없다** — `assertSelectable`이 같은 `is_visible`로 거부하기 때문에,
   * 사용자는 고를 수는 있는데 [다음]에서 400을 받고 재조회해도 같은 목록을 다시 본다.
   * **빠져나갈 수 없는 화면이 된다.**
   *
   * `onboarding.md` 7장과 `onboarding-api.md` 4.2가 정한 것도 그 반대다 —
   * "데이터 정합성 오류로 다루어 운영 알림을 발생시키고 **폴백 주제를 만들지 않는다**",
   * "`is_visible = false`인 주제는 목록에 담지도, **저장을 허용하지도 않는다**".
   *
   * 빈 목록을 내려주면 클라이언트는 조회 실패 상태(O6)를 그리고 재시도할 수 있다.
   * 운영이 `is_visible`을 켜는 순간 같은 재시도가 통과한다.
   */
  async getSelectableTopics(manager?: EntityManager): Promise<TopicListResult> {
    const visible = await this.topicRepository.findAllVisible(manager);

    if (visible.length === 0) {
      // 운영 알림 — `is_visible` 설정과 콘텐츠 풀을 점검해야 한다 (onboarding.md 7)
      this.logger.error('onboarding topic list is empty');
    }

    return {
      topics: visible.map(toTopicView),
      maxSelectable: MAX_SELECTABLE_TOPIC_COUNT,
      // 폴백을 만들지 않으므로 항상 false다. 계약 필드는 유지한다(onboarding-api.md 4.2)
      isFallback: false,
    };
  }

  /**
   * onboarding-api.md 4.3 — 저장을 허용할 주제인지 판정한다.
   *
   * **"없는 주제"와 "숨겨진 주제"를 구분하지 않는다.** 구분해 주면 임의의 UUID를 던져
   * 비노출 주제의 존재 여부를 탐침할 수 있다.
   */
  async findUnavailableTopicIds(
    topicIds: string[],
    manager?: EntityManager,
  ): Promise<string[]> {
    const found = await this.topicRepository.findAllByIds(topicIds, manager);
    const availableIds = new Set(
      found.filter((topic) => topic.isVisible).map((topic) => topic.id),
    );

    return topicIds.filter((topicId) => !availableIds.has(topicId));
  }

  async findAllByIds(
    topicIds: string[],
    manager?: EntityManager,
  ): Promise<Topic[]> {
    return this.topicRepository.findAllByIds(topicIds, manager);
  }

  /**
   * 노출 주제 목록, `display_order` 오름차순.
   *
   * **`getSelectableTopics`와 달리 폴백이 없다.** 그쪽은 온보딩 1단계가 통째로 막히는 것을
   * 막으려고 노출 주제가 0건이면 전체를 내려보내지만(`onboarding.md` 7), 탐색 칩 줄에는 그
   * 사정이 없다 — 고를 것이 없으면 피드도 비어 화면이 칩 줄 자체를 숨긴다
   * (`explore-uiux.md` 4.7).
   */
  async findAllVisible(manager?: EntityManager): Promise<Topic[]> {
    return this.topicRepository.findAllVisible(manager);
  }

  /**
   * 검색 빈 결과 fallback의 관련 주제(explore-api.md 4.5 — `related_topics`).
   * 질의는 호출부가 정규화(NFC·소문자)해 넘긴다. 관련 주제가 없으면 빈 배열이다.
   */
  async findVisibleRelatedByName(
    normalizedQuery: string,
    limit: number,
    manager?: EntityManager,
  ): Promise<Topic[]> {
    return this.topicRepository.findVisibleRelatedByName(
      normalizedQuery,
      RELATED_TOPIC_SIMILARITY_THRESHOLD,
      limit,
      manager,
    );
  }

  /** admin.md 5장 — 숨긴 주제까지 전부. 관리자만 쓴다 */
  async findAll(manager?: EntityManager): Promise<Topic[]> {
    return this.topicRepository.findAll(manager);
  }

  async getById(id: string, manager?: EntityManager): Promise<Topic> {
    const topic = await this.topicRepository.findById(id, manager);

    if (!topic) {
      throw new BusinessNotFoundException({
        errorCode: ErrorCode.NOT_FOUND,
        message: '주제를 찾을 수 없어요',
      });
    }

    return topic;
  }

  /**
   * admin.md 4.5 — 새 주제는 **숨김(`is_visible = false`)으로 만든다**(domain.md 4.1 기본값).
   * 콘텐츠가 충분히 쌓인 뒤 관리자가 노출을 켠다.
   * `displayOrder`를 비우면 맨 뒤(현재 최댓값 + 1)에 둔다.
   */
  async create(
    command: CreateTopicCommand,
    manager?: EntityManager,
  ): Promise<Topic> {
    const displayOrder =
      command.displayOrder ??
      Math.max(
        0,
        ...(await this.topicRepository.findAll(manager)).map(
          (t) => t.displayOrder,
        ),
      ) + 1;

    const topic = this.topicRepository.create({
      name: command.name,
      parentCategory: command.parentCategory,
      isVisible: false,
      displayOrder,
    });
    const [saved] = await this.topicRepository.saveAll([topic], manager);

    return saved;
  }

  async update(
    topic: Topic,
    command: UpdateTopicCommand,
    manager?: EntityManager,
  ): Promise<Topic> {
    if (command.name !== undefined) {
      topic.name = command.name;
    }
    if (command.parentCategory !== undefined) {
      topic.parentCategory = command.parentCategory;
    }
    if (command.isVisible !== undefined) {
      topic.isVisible = command.isVisible;
    }
    if (command.displayOrder !== undefined) {
      topic.displayOrder = command.displayOrder;
    }

    const [saved] = await this.topicRepository.saveAll([topic], manager);
    return saved;
  }

  /** 콘텐츠가 배정된 주제의 삭제 거부는 호출부(admin)가 건수를 보고 판정한다(admin.md 4.5) */
  async remove(topic: Topic, manager?: EntityManager): Promise<void> {
    await this.topicRepository.remove(topic, manager);
  }
}

function toTopicView(topic: Topic) {
  return {
    topicId: topic.id,
    name: topic.name,
    parentCategory: topic.parentCategory,
  };
}
