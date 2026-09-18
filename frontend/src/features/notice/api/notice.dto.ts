/**
 * DTO — settings-api.md 4.4·4.5 계약 그대로 snake_case로 선언한다(convention.md 1.6).
 * 공통 규약(2장): Bearer 인증, snake_case, ISO 8601 UTC.
 */

/** settings-api.md 4.4 목록 항목 — 본문(body)은 목록에 싣지 않는다 */
export interface NoticeListItemDto {
  id: string;
  title: string;
  is_pinned: boolean;
  published_at: string;
}

/** settings-api.md 4.4 응답 — next_cursor는 정렬(is_pinned DESC, published_at DESC, id DESC)의 불투명 토큰 */
export interface NoticeListResponseDto {
  items: NoticeListItemDto[];
  next_cursor: string | null;
}

/** settings-api.md 4.5 응답 — 미발행·삭제는 404 NOTICE_NOT_FOUND */
export interface NoticeDetailResponseDto {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  published_at: string;
  updated_at: string;
}
