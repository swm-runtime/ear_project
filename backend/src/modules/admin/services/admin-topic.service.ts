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
 * admin.md 4.5 — 주제 관리(FR-38). `topics.is_visible`은 **여기서만** 바뀐다(domain.md 4.1).
 * 콘텐츠가 0건인 주제의 노출 켜기(false → true 전이)는 서버가 409로 거부한다(2026-09-15 번복, KAN-58) —
 * PRD 8.1 "0건 주제 선택 불가"를 서버가 보증해야 사용자가 빈 주제를 고르고, 그 주제를 지울 때 FK 500이 나는 경로가 닫힌다.
 */
@Injectable()
export class AdminTopicService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly topicService: TopicService,
    private readonly contentService: ContentService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(): Promise<AdminTopicView[]> {
    const topics = await this.topicService.findAll();
    const counts = await this.contentService.countByTopicIds(
      topics.map((topic) => topic.id),
    );

    return topics.map((topic) => ({
      topic,
      contentCount: counts.get(topic.id) ?? 0,
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

    return { topic, contentCount: 0 };
  }

  async update(
    actorUserId: string,
    topicId: string,
    command: UpdateTopicCommand,
  ): Promise<AdminTopicView> {
    const topic = await this.dataSource.transaction(async (manager) => {
      const current = await this.topicService.getById(topicId, manager);
      const before = snapshot(current);
      await this.assertHasContentsIfTurningVisible(current, command, manager);
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
    const counts = await this.contentService.countByTopicIds([topic.id]);

    return { topic, contentCount: counts.get(topic.id) ?? 0 };
  }

  /**
   * 노출을 **켜는 전이**(false → true)만 판정한다 — 이미 노출 중인 0건 주제의 이름·정렬 수정은 통과한다.
   * 건수는 삭제 판정과 같은 집계(`countByTopicIds` — 상태 무관 배정 건수)를 쓴다.
   */
  private async assertHasContentsIfTurningVisible(
    current: Topic,
    command: UpdateTopicCommand,
    manager: EntityManager,
  ): Promise<void> {
    if (command.isVisible !== true || current.isVisible) {
      return;
    }
    const counts = await this.contentService.countByTopicIds(
      [current.id],
      manager,
    );
    const contentCount = counts.get(current.id) ?? 0;
    if (contentCount === 0) {
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
