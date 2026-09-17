import { Notice } from '../entities/notice.entity';

/** settings-api.md 4.4 — 목록 행. **본문을 싣지 않는다**(목록은 가볍게, 본문은 상세에서) */
export class NoticeListItemDto {
  readonly id: string;
  readonly title: string;
  readonly is_pinned: boolean;
  readonly published_at: string;

  static from(notice: Notice): NoticeListItemDto {
    return {
      id: notice.id,
      title: notice.title,
      is_pinned: notice.isPinned,
      // 발행된 공지만 오므로 null 이 아니다(Repository 조건)
      published_at: (notice.publishedAt as Date).toISOString(),
    };
  }
}

export class NoticeListResponseDto {
  readonly items: NoticeListItemDto[];
  readonly next_cursor: string | null;

  static from(
    notices: Notice[],
    nextCursor: string | null,
  ): NoticeListResponseDto {
    return {
      items: notices.map((notice) => NoticeListItemDto.from(notice)),
      next_cursor: nextCursor,
    };
  }
}
