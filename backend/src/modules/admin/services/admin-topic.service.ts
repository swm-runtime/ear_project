import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessConflictException } from '@/common/exceptions/business-conflict.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import {
  CreateTopicCommand,
  UpdateTopicCommand,
} from '@/modules/interest/interest.types';
import { TopicService } from '@/modules/interest/services/topic.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import { AdminTopicView } from '../admin.types';
import {
  AUDIT_ACTION_TOPIC_CREATE,
  AUDIT_ACTION_TOPIC_DELETE,
  AUDIT_ACTION_TOPIC_UPDATE,
} from '../admin.constant';

/**
 * admin.md 4.5 — 주제 관리(FR-38). 관리자가 `topics.is_visible`을 바꾸는 경로는 **여기뿐이다**(domain.md 4.1).
 *
 * **노출 가능 콘텐츠가 0건인 주제는 노출을 켤 수 없다**(KAN-58, 2026-09-17 번복). 종전에는 콘솔이
 * 경고만 하고 서버는 통과시켰는데, 0건인 채 노출된 주제를 사용자가 고르면 온보딩 추천이 비고
 * (onboarding.md 3장 전제 붕괴) 주제 삭제가 `user_interests` FK에 걸려 500이 났다. 순서는
 * "콘텐츠 발행 → 주제 노출"로 고정한다 — 업로드는 숨긴 주제에도 배정할 수 있어 성립한다.
 * 반대 방향(콘텐츠가 빠져 0건이 됨)은 `TopicExposureService`가 자동으로 숨긴다.
 */
@Injectable()
export class AdminTopicService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly topicService: TopicService,
    private readonly contentService: ContentService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(now: Date): Promise<AdminTopicView[]> {
    const topics = await this.topicService.findAll();
    const topicIds = topics.map((topic) => topic.id);
    const [counts, visibleCounts] = await Promise.all([
      this.contentService.countByTopicIds(topicIds),
      this.contentService.countVisibleByTopicIds(topicIds, now),
    ]);

    return topics.map((topic) => ({
      topic,
      contentCount: counts.get(topic.id) ?? 0,
      visibleContentCount: visibleCounts.get(topic.id) ?? 0,
    }));
  }

  async create(
    actorUserId: string,
    command: CreateTopicCommand,
  ): Promise<AdminTopicView> {
    const topic = await this.dataSource.transaction(async (manager) => {
      const created = await this.topicService.create(command, manager);
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_TOPIC_CREATE,
          target: `topic:${created.id}`,
          after: snapshot(created),
        },
        manager,
      );
      return created;
    });

    return { topic, contentCount: 0, visibleContentCount: 0 };
  }

  async update(
    actorUserId: string,
    topicId: string,
    command: UpdateTopicCommand,
    now: Date,
  ): Promise<AdminTopicView> {
    const topic = await this.dataSource.transaction(async (manager) => {
      // 잠그고 읽는다 — 동시에 마지막 콘텐츠가 회수되면 그쪽 자동 숨김과 이 판정이 서로를 못 본다
      const current = await this.topicService.getByIdForUpdate(
        topicId,
        manager,
      );
      await this.assertVisibleContentsForTurningOn(
        current,
        command,
        now,
        manager,
      );
      const before = snapshot(current);
      const updated = await this.topicService.update(current, command, manager);
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_TOPIC_UPDATE,
          target: `topic:${updated.id}`,
          before,
          after: snapshot(updated),
        },
        manager,
      );
      return updated;
    });
    const [counts, visibleCounts] = await Promise.all([
      this.contentService.countByTopicIds([topic.id]),
      this.contentService.countVisibleByTopicIds([topic.id], now),
    ]);

    return {
      topic,
      contentCount: counts.get(topic.id) ?? 0,
      visibleContentCount: visibleCounts.get(topic.id) ?? 0,
    };
  }

  /**
   * **숨김 → 노출 전환일 때만** 건수를 본다. 이미 노출 중인 주제의 이름·정렬 수정이나 끄기는
   * 통과시킨다 — 규칙 이전에 0건인 채 켜진 주제도 끌 수는 있어야 한다.
   *
   * 트랜잭션 안에서 센다. 목록 조회와 요청 사이에 콘텐츠가 회수됐을 수 있어, 콘솔이 본 건수가
   * 아니라 **지금 건수**로 판정한다(콘솔은 409 를 받으면 목록을 다시 읽는다).
   */
  private async assertVisibleContentsForTurningOn(
    current: Topic,
    command: UpdateTopicCommand,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    if (command.isVisible !== true || current.isVisible) {
      return;
    }

    const counts = await this.contentService.countVisibleByTopicIds(
      [current.id],
      now,
      manager,
    );

    if ((counts.get(current.id) ?? 0) === 0) {
      throw new BusinessConflictException({
        errorCode: ErrorCode.ADMIN_TOPIC_HAS_NO_CONTENTS,
        message:
          '콘텐츠가 0건이라 노출할 수 없어요. 콘텐츠를 먼저 발행해주세요',
        details: { content_count: 0 },
      });
    }
  }

  /** admin.md 4.5 — 콘텐츠가 있는 주제는 지우지 않고 숨김을 안내한다 */
  async remove(actorUserId: string, topicId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const topic = await this.topicService.getById(topicId, manager);
      const counts = await this.contentService.countByTopicIds(
        [topic.id],
        manager,
      );
      const contentCount = counts.get(topic.id) ?? 0;

      if (contentCount > 0) {
        throw new BusinessConflictException({
          errorCode: ErrorCode.ADMIN_TOPIC_HAS_CONTENTS,
          message: `콘텐츠가 ${contentCount}건 있어 삭제할 수 없어요. 숨김 처리를 권장합니다`,
          details: { content_count: contentCount },
        });
      }

      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_TOPIC_DELETE,
          target: `topic:${topic.id}`,
          before: snapshot(topic),
        },
        manager,
      );
      await this.topicService.remove(topic, manager);
    });
  }
}

function snapshot(topic: Topic): Record<string, unknown> {
  return {
    name: topic.name,
    parent_category: topic.parentCategory,
    is_visible: topic.isVisible,
    display_order: topic.displayOrder,
  };
}
