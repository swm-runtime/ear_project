/** 별점 범위(`content-review-api.md` 4.2) — DB CHECK(`ck_content_reviews_stars`)와 같은 값 */
export const CONTENT_REVIEW_MIN_STARS = 1;
export const CONTENT_REVIEW_MAX_STARS = 5;

/** 글 길이 상한 — 앞뒤 공백을 뺀 뒤 **코드 포인트** 수(4.2). 넘으면 잘라 저장하지 않고 400 이다 */
export const CONTENT_REVIEW_MAX_TEXT = 500;

/**
 * 먼저 묻는 간격(서비스 날짜) — 마지막으로 물은 날 + 5일부터 다시 묻는다(`content-review.md` 4.3, 결정 2026-10-28).
 * 10-28에 물었으면 11-02부터 — 11-01(4일째)은 묻지 않는다
 */
export const CONTENT_REVIEW_PROMPT_INTERVAL_DAYS = 5;

/** 먼저 묻는 대상 — 최근 14 서비스 날짜 안(오늘 포함)에 끝까지 들은 편(4.3-4) */
export const CONTENT_REVIEW_PROMPT_RECENT_DAYS = 14;

/** 관리자 글 목록 페이지 크기(4.9) */
export const CONTENT_REVIEW_ADMIN_DEFAULT_LIMIT = 20;
export const CONTENT_REVIEW_ADMIN_MAX_LIMIT = 100;
