/** 목록 페이지 크기 — 기본 20, 최대 50 (convention.md 3.3 · 계약 4.4) */
export const NOTICE_LIST_DEFAULT_LIMIT = 20;
export const NOTICE_LIST_MAX_LIMIT = 50;

/** 계약 검증 상한 — `title` 1~100자(컬럼 varchar(100)), `body` 1~5000자 */
export const NOTICE_TITLE_MAX_LENGTH = 100;
export const NOTICE_BODY_MAX_LENGTH = 5000;

/** 커서는 불투명 문자열이지만 길이 상한은 둔다 */
export const NOTICE_CURSOR_MAX_LENGTH = 512;
