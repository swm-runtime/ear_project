import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { ContentService } from '@/modules/content/services/content.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { TopicService } from '@/modules/interest/services/topic.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import {
  AUDIT_ACTION_TOPIC_AUTO_HIDE,
  SYSTEM_AUDIT_ACTOR,
} from '../admin.constant';

/** 자동 숨김을 일으킨 경로 — 감사 로그에 남겨 "왜 숨겨졌나"를 추적한다 */
export type TopicAutoHideTrigger = 'withdraw' | 'republish' | 'daily_sweep';

export interface HideEmptyTopicsCommand {
  topicIds: string[];
  /** 사람이 한 조작(회수·재발행)이면 그 관리자, 배치면 null → `system` */
  actor: string | null;
  trigger: TopicAutoHideTrigger;
  now: Date;
}

/**
 * **노출 중인 주제는 노출 가능한 콘텐츠를 1건 이상 가져야 한다**(admin.md 4.5 — KAN-58, 2026-09-17).
 *
 * 온보딩이 전제로 삼는 "고를 수는 있는데 볼 게 없는 주제는 존재하지 않는다"(onboarding.md 3장)를
 * 서버가 지킨다. 두 방향으로 막는다:
 *   - 켜기 — 0건 주제의 노출 켜기 거부(`AdminTopicService.update`, 409)
 *   - 꺼지기 — 콘텐츠가 빠져 0건이 된 주제를 **이 서비스가 숨긴다**
 *
 * **판정을 이 한 곳에 둔다.** 0건이 되는 경로가 회수·재발행(주제 교체)·라이선스 만료로 흩어져
 * 있어, 경로마다 판정하면 한 곳만 기준이 바뀌는 일이 생긴다. 각 경로는 영향받은 주제 id 만 넘긴다.
 *
 * **숨긴 주제는 사용자 관심사에서도 빠진다** — 새 규칙이 아니라 기존 숨김 동작이다
 * (interest-management.md — 결정 2026-08-11, 조회 시점 필터). 행은 남는다.
 *
 * **자동으로 켜지는 일은 없다.** 콘텐츠가 다시 생겨도(복구·새 발행) 노출은 관리자가 켠다 —
 * `is_visible`을 올리는 주체는 여전히 관리자 하나다.
 *
 * **admin 모듈에 두는 이유**: 판정에 콘텐츠 건수(content)·주제(interest)·감사 로그(partner)가 함께
 * 필요하다. 셋을 이미 조합하는 유스케이스 모듈이 admin 이라 새 의존 방향이 생기지 않는다. content 에
 * 두면 `content → partner`가 생겨 문서의 `partner → content`(domain.md 2장)와 순환이 예정된다.
 *
 * **동시성** — 판정 전에 주제 행을 잠근다. 잠그지 않으면 READ COMMITTED 에서 (a) 노출 켜기와 마지막
 * 콘텐츠 회수가 서로의 커밋 전 상태를 보고 둘 다 통과하거나, (b) 마지막 두 콘텐츠의 동시 회수가 서로를
 * 아직 발행 중으로 세어 아무도 숨기지 않는다. 잠금을 기다린 쪽은 먼저 커밋한 결과를 보고 판정한다.
 */
@Injectable()
export class TopicExposureService {
  private readonly logger = new Logger(TopicExposureService.name);

  constructor(
    private readonly contentService: ContentService,
    private readonly topicService: TopicService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * 넘겨받은 주제 중 **노출 중이면서 노출 가능 콘텐츠가 0건인 것**을 숨기고, 실제로 숨긴 주제를 돌려준다.
   *
   * 멱등이다 — 이미 숨겨졌거나 콘텐츠가 있는 주제는 건드리지 않으므로 같은 입력으로 다시 불러도
   * 결과가 같다. 매일 배치가 전체를 다시 훑어도 안전한 이유다.
   *
   * **호출부의 트랜잭션 안에서 돈다.** 회수와 숨김이 따로 커밋되면 "콘텐츠는 내려갔는데 주제는
   * 노출 중"인 상태가 남는다.
   */
  async hideEmptyTopics(
    command: HideEmptyTopicsCommand,
    manager: EntityManager,
  ): Promise<Topic[]> {
    const topicIds = [...new Set(command.topicIds)];

    if (topicIds.length === 0) {
      return [];
    }

    const topics = await this.topicService.findAllByIdsForUpdate(
      topicIds,
      manager,
    );
    const visible = topics.filter((topic) => topic.isVisible);

    if (visible.length === 0) {
      return [];
    }

    const counts = await this.contentService.countVisibleByTopicIds(
      visible.map((topic) => topic.id),
      command.now,
      manager,
    );
    const empty = visible.filter((topic) => (counts.get(topic.id) ?? 0) === 0);
    const hidden = await this.topicService.hideAll(empty, manager);

    for (const topic of hidden) {
      await this.auditLogService.record(
        {
          actor: command.actor ?? SYSTEM_AUDIT_ACTOR,
          action: AUDIT_ACTION_TOPIC_AUTO_HIDE,
          target: `topic:${topic.id}`,
          before: { is_visible: true },
          after: {
            is_visible: false,
            trigger: command.trigger,
            visible_content_count: 0,
          },
        },
        manager,
      );
    }

    if (hidden.length > 0) {
      this.logger.log('topics auto-hidden with no visible contents', {
        trigger: command.trigger,
        hidden_count: hidden.length,
        topic_ids: hidden.map((topic) => topic.id),
      });
    }

    return hidden;
  }

  /**
   * 노출 중인 **모든** 주제를 훑어 0건인 것을 숨긴다 — 매일 배치용.
   *
   * 회수·재발행은 그 자리에서 판정하지만 **라이선스 만료는 사건이 아니라 시각이 지나는 것**이라
   * 트리거가 없다. 그리고 이 규칙 이전에 0건인 채 켜진 주제(백필)도 여기서 한 번에 정리된다.
   * 멱등이라 매일 돌아도 바뀔 것이 없으면 아무것도 하지 않는다.
   */
  async hideAllEmptyVisibleTopics(
    now: Date,
    manager: EntityManager,
  ): Promise<Topic[]> {
    const visible = await this.topicService.findAllVisible(manager);

    return this.hideEmptyTopics(
      {
        topicIds: visible.map((topic) => topic.id),
        actor: null,
        trigger: 'daily_sweep',
        now,
      },
      manager,
    );
  }
}
