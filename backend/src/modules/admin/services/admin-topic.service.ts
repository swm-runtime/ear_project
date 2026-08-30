import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
 * 콘텐츠가 0건인 주제의 노출 켜기 경고 확인은 화면(콘솔)이 하고, 서버는 기록만 남긴다.
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
