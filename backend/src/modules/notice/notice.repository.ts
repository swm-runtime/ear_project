import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { Notice } from './entities/notice.entity';
import {
  AdminNoticeCursorPosition,
  PublishedNoticeCursorPosition,
} from './notice.types';

@Injectable()
export class NoticeRepository {
  constructor(
    @InjectRepository(Notice)
    private readonly repository: Repository<Notice>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Notice> {
    return manager ? manager.getRepository(Notice) : this.repository;
  }

  /**
   * 발행된 공지 — `published_at <= now` · 삭제 안 됨. 정렬 `is_pinned DESC, published_at DESC, id DESC`.
   * 세 키가 모두 내림차순이라 **행 비교 하나**로 keyset 조건이 된다(boolean 은 false < true).
   * `take`는 호출부가 한 건 더 달라고 해 다음 페이지 유무를 안다.
   */
  async findPublishedPage(
    now: Date,
    cursor: PublishedNoticeCursorPosition | null,
    take: number,
  ): Promise<Notice[]> {
    const builder = this.repository
      .createQueryBuilder('notice')
      .where('notice.published_at IS NOT NULL')
      .andWhere('notice.published_at <= :now', { now })
      .orderBy('notice.is_pinned', 'DESC')
      .addOrderBy('notice.published_at', 'DESC')
      .addOrderBy('notice.id', 'DESC')
      .limit(take);

    if (cursor) {
      builder.andWhere(
        '(notice.is_pinned, notice.published_at, notice.id) < (:cursorPinned, :cursorPublishedAt, :cursorId)',
        {
          cursorPinned: cursor.isPinned,
          cursorPublishedAt: cursor.publishedAt,
          cursorId: cursor.id,
        },
      );
    }

    return builder.getMany();
  }

  /** 발행된 공지 한 건. 초안·예약·삭제는 없는 것으로 본다 */
  async findPublishedById(id: string, now: Date): Promise<Notice | null> {
    return this.repository
      .createQueryBuilder('notice')
      .where('notice.id = :id', { id })
      .andWhere('notice.published_at IS NOT NULL')
      .andWhere('notice.published_at <= :now', { now })
      .getOne();
  }

  /**
   * 관리자 목록 — 초안·예약 포함, 삭제 제외. 정렬 `created_at DESC, id DESC`.
   *
   * **`created_at`을 밀리초로 잘라 정렬·비교한다.** DB 기본값 `now()`는 마이크로초까지 담는데 커서는
   * JS `Date`(밀리초)로 오간다 — 자르지 않으면 같은 밀리초 안의 행이 경계에서 누락되거나 겹친다.
   * 공지는 수십 건이라 인덱스를 못 타도 문제없다.
   */
  async findAdminPage(
    cursor: AdminNoticeCursorPosition | null,
    take: number,
  ): Promise<Notice[]> {
    const createdAt = "date_trunc('milliseconds', notice.created_at)";
    const builder = this.repository
      .createQueryBuilder('notice')
      .orderBy(createdAt, 'DESC')
      .addOrderBy('notice.id', 'DESC')
      .limit(take);

    if (cursor) {
      builder.where(
        `(${createdAt}, notice.id) < (:cursorCreatedAt, :cursorId)`,
        { cursorCreatedAt: cursor.createdAt, cursorId: cursor.id },
      );
    }

    return builder.getMany();
  }

  /** 삭제되지 않은 공지(초안 포함) */
  async findById(id: string, manager?: EntityManager): Promise<Notice | null> {
    return this.scoped(manager).findOneBy({ id });
  }

  /** 수정·삭제 전 잠금 조회 — 동시 수정이 서로의 변경을 덮거나 감사 로그 `before`가 낡지 않게 한다 */
  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Notice | null> {
    return manager.getRepository(Notice).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async save(notice: Notice, manager?: EntityManager): Promise<Notice> {
    return this.scoped(manager).save(notice);
  }

  async softDelete(id: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).softDelete({ id });
  }

  create(notice: Partial<Notice>): Notice {
    return this.repository.create(notice);
  }
}
