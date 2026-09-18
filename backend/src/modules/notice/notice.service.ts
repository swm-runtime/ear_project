import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { isUuid } from '@/common/utils/cursor-value.util';

import { Notice } from './entities/notice.entity';
import { NoticeRepository } from './notice.repository';
import {
  AdminNoticeCursorPosition,
  CreateNoticeCommand,
  NoticePage,
  PublishedNoticeCursorPosition,
  UpdateNoticeCommand,
} from './notice.types';

/**
 * `notices`의 소유자(`changes/pending/notice-screen-spec.md` D). 사용자 조회와 관리자 쓰기가 같은
 * 판정("발행됨 = `published_at <= 서버 시각`")을 쓰도록 이 Service 한 곳에 둔다.
 *
 * 관리자 쓰기의 감사 기록은 여기서 하지 않는다 — admin 모듈이 이 Service와 `AuditLogService`를
 * 한 트랜잭션으로 조합한다(주제·콘텐츠 관리와 같은 구조). notice 모듈은 다른 모듈을 모른다.
 */
@Injectable()
export class NoticeService {
  constructor(private readonly noticeRepository: NoticeRepository) {}

  async findPublishedPage(
    now: Date,
    cursor: PublishedNoticeCursorPosition | null,
    limit: number,
  ): Promise<NoticePage<Notice>> {
    return toPage(
      await this.noticeRepository.findPublishedPage(now, cursor, limit + 1),
      limit,
    );
  }

  /** 초안·예약·삭제·없음은 모두 같은 404다 — 존재 여부를 구분해 알려주지 않는다 */
  async getPublished(id: string, now: Date): Promise<Notice> {
    // uuid 가 아닌 id 는 없는 공지와 같다 — Postgres 에 닿으면 형식 오류 500 이 된다
    const notice = isUuid(id)
      ? await this.noticeRepository.findPublishedById(id, now)
      : null;

    if (!notice) {
      throw notFound();
    }

    return notice;
  }

  async findAdminPage(
    cursor: AdminNoticeCursorPosition | null,
    limit: number,
  ): Promise<NoticePage<Notice>> {
    return toPage(
      await this.noticeRepository.findAdminPage(cursor, limit + 1),
      limit,
    );
  }

  /** 관리자 조회 — 초안 포함, 삭제 제외 */
  async getById(id: string, manager?: EntityManager): Promise<Notice> {
    const notice = isUuid(id)
      ? await this.noticeRepository.findById(id, manager)
      : null;

    if (!notice) {
      throw notFound();
    }

    return notice;
  }

  /** 관리자 수정·삭제용 잠금 조회 — 트랜잭션 안에서만 부른다 */
  async getByIdForUpdate(id: string, manager: EntityManager): Promise<Notice> {
    const notice = isUuid(id)
      ? await this.noticeRepository.findByIdForUpdate(id, manager)
      : null;

    if (!notice) {
      throw notFound();
    }

    return notice;
  }

  async create(
    command: CreateNoticeCommand,
    manager?: EntityManager,
  ): Promise<Notice> {
    return this.noticeRepository.save(
      this.noticeRepository.create({
        title: command.title,
        body: command.body,
        isPinned: command.isPinned,
        publishedAt: command.publishedAt,
      }),
      manager,
    );
  }

  /** 담긴 키만 바꾼다. `publishedAt: null`은 발행 취소, `undefined`는 그대로다 */
  async update(
    notice: Notice,
    command: UpdateNoticeCommand,
    manager?: EntityManager,
  ): Promise<Notice> {
    if (command.title !== undefined) {
      notice.title = command.title;
    }
    if (command.body !== undefined) {
      notice.body = command.body;
    }
    if (command.isPinned !== undefined) {
      notice.isPinned = command.isPinned;
    }
    if (command.publishedAt !== undefined) {
      notice.publishedAt = command.publishedAt;
    }

    return this.noticeRepository.save(notice, manager);
  }

  async remove(notice: Notice, manager?: EntityManager): Promise<void> {
    await this.noticeRepository.softDelete(notice.id, manager);
  }
}

function toPage(rows: Notice[], limit: number): NoticePage<Notice> {
  return { items: rows.slice(0, limit), hasNext: rows.length > limit };
}

function notFound(): BusinessNotFoundException {
  return new BusinessNotFoundException({
    errorCode: ErrorCode.NOTICE_NOT_FOUND,
    message: '삭제된 공지예요',
  });
}
