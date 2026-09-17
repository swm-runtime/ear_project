import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Notice } from '@/modules/notice/entities/notice.entity';
import { NoticeService } from '@/modules/notice/notice.service';
import {
  AdminNoticeCursorPosition,
  CreateNoticeCommand,
  NoticePage,
  UpdateNoticeCommand,
} from '@/modules/notice/notice.types';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import {
  AUDIT_ACTION_NOTICE_CREATE,
  AUDIT_ACTION_NOTICE_DELETE,
  AUDIT_ACTION_NOTICE_UPDATE,
} from '../admin.constant';

/**
 * admin-api.md 4.12~4.15 — 공지 관리(KAN-67). 쓰기와 감사 기록을 **한 트랜잭션**으로 묶는다 —
 * `notices`에 작성자 컬럼이 없어 누가 게시했는지는 `audit_logs`만 안다(주제·콘텐츠 관리와 같은 구조).
 */
@Injectable()
export class AdminNoticeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly noticeService: NoticeService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findPage(
    cursor: AdminNoticeCursorPosition | null,
    limit: number,
  ): Promise<NoticePage<Notice>> {
    return this.noticeService.findAdminPage(cursor, limit);
  }

  async create(
    actorUserId: string,
    command: CreateNoticeCommand,
  ): Promise<Notice> {
    return this.dataSource.transaction(async (manager) => {
      const created = await this.noticeService.create(command, manager);
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_NOTICE_CREATE,
          target: `notice:${created.id}`,
          after: snapshot(created),
        },
        manager,
      );
      return created;
    });
  }

  async update(
    actorUserId: string,
    noticeId: string,
    command: UpdateNoticeCommand,
  ): Promise<Notice> {
    return this.dataSource.transaction(async (manager) => {
      const current = await this.noticeService.getByIdForUpdate(
        noticeId,
        manager,
      );
      const before = snapshot(current);
      const updated = await this.noticeService.update(
        current,
        command,
        manager,
      );
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_NOTICE_UPDATE,
          target: `notice:${updated.id}`,
          before,
          after: snapshot(updated),
        },
        manager,
      );
      return updated;
    });
  }

  async remove(actorUserId: string, noticeId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const current = await this.noticeService.getByIdForUpdate(
        noticeId,
        manager,
      );
      await this.noticeService.remove(current, manager);
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_NOTICE_DELETE,
          target: `notice:${current.id}`,
          before: snapshot(current),
        },
        manager,
      );
    });
  }
}

/** 본문은 길 수 있어 길이만 남긴다 — 감사 로그는 "무엇이 바뀌었나"를 추적하는 용도다 */
function snapshot(notice: Notice): Record<string, unknown> {
  return {
    title: notice.title,
    body_length: notice.body.length,
    is_pinned: notice.isPinned,
    published_at: notice.publishedAt?.toISOString() ?? null,
  };
}
