import { Notice } from '@/modules/notice/entities/notice.entity';

/**
 * admin-api.md 4.12 — 관리자 공지 항목. 사용자 목록과 달리 **본문과 초안까지 싣는다**(콘솔이 수정 화면을 바로 연다).
 * 상태(초안·예약·발행)는 `published_at`과 서버 시각으로 콘솔이 표시만 한다 — 판정이 필요한 곳은 서버 조회뿐이다.
 */
export class AdminNoticeItemDto {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly is_pinned: boolean;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;

  static from(notice: Notice): AdminNoticeItemDto {
    return {
      id: notice.id,
      title: notice.title,
      body: notice.body,
      is_pinned: notice.isPinned,
      published_at: notice.publishedAt?.toISOString() ?? null,
      created_at: notice.createdAt.toISOString(),
      updated_at: notice.updatedAt.toISOString(),
    };
  }
}

export class AdminNoticeListResponseDto {
  readonly items: AdminNoticeItemDto[];
  readonly next_cursor: string | null;

  static from(
    notices: Notice[],
    nextCursor: string | null,
  ): AdminNoticeListResponseDto {
    return {
      items: notices.map((notice) => AdminNoticeItemDto.from(notice)),
      next_cursor: nextCursor,
    };
  }
}
