/**
 * 공지 도메인 모델(camelCase) — 변환은 api/notice.api.ts 안에서만 일어난다(convention.md 1.6).
 * "발행됨" 판정은 서버가 published_at으로 한다(settings.md 4.7 규칙 9) — 클라이언트는 받은
 * 목록을 그대로 그리고 기기 시각으로 거르지 않는다.
 */

/** GET /notices 항목 — 본문은 싣지 않는다(settings-api.md 4.4: 목록은 가볍게) */
export interface NoticeSummary {
  id: string;
  title: string;
  isPinned: boolean;
  /** ISO 8601 UTC */
  publishedAt: string;
}

/** GET /notices/:notice_id — 본문은 줄바꿈을 보존한 일반 텍스트다(settings.md 4.7 규칙 5) */
export interface NoticeDetail extends NoticeSummary {
  body: string;
  /** ISO 8601 UTC */
  updatedAt: string;
}

/** 목록 한 페이지 — 커서는 서버 정렬(is_pinned DESC, published_at DESC, id DESC)의 불투명 토큰 */
export interface NoticePage {
  items: NoticeSummary[];
  nextCursor: string | null;
}
