import { toServiceDate } from '@/common/utils/service-date.util';
import { ContentStatus } from '@/modules/content/content.enum';
import { UserMarket } from '@/modules/user/user.enum';

import { AdminContentReviewRow } from '../content-review.types';

/**
 * `GET /admin/content-reviews` (content-review-api.md 4.9). **작성자 계정(`user_id`) · 닉네임 · 이메일을 싣지 않는다.**
 * 시각 대신 서비스 날짜만 싣는다 — 작성자를 좁힐 단서를 줄인다.
 */
export class AdminContentReviewListResponseDto {
  readonly items: {
    id: string;
    content_id: string;
    content_title: string;
    content_status: ContentStatus;
    stars: number;
    text: string | null;
    is_completed: boolean;
    content_version: number;
    market: UserMarket;
    created_date: string;
    updated_date: string;
  }[];
  readonly next_cursor: string | null;

  static from(
    rows: AdminContentReviewRow[],
    nextCursor: string | null,
  ): AdminContentReviewListResponseDto {
    return {
      items: rows.map((row) => ({
        id: row.id,
        content_id: row.contentId,
        content_title: row.contentTitle,
        content_status: row.contentStatus,
        stars: row.stars,
        text: row.text,
        is_completed: row.isCompleted,
        content_version: row.contentVersion,
        market: row.market,
        created_date: toServiceDate(row.createdAt),
        updated_date: toServiceDate(row.updatedAt),
      })),
      next_cursor: nextCursor,
    };
  }
}
