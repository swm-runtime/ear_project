/**
 * 백엔드 공지 API(GET /notices · GET /notices/:id)가 통합 전이라 개발 중에는 mock으로 동작한다
 * (api/notice.mock.ts). 백엔드 준비 후 실서버로 붙일 때는 EXPO_PUBLIC_NOTICE_API=real 로 전환한다.
 */
export const IS_NOTICE_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_NOTICE_API !== 'real';

/** 목록 페이지 크기 — 서버 기본값과 같은 20이다(settings.md 4.7 규칙 3 · settings-api.md 4.4) */
export const NOTICE_PAGE_SIZE = 20;

/** 목록 캐시 stale 5분(settings.md 4.7 규칙 8) — 공지 빈도가 낮아 진입마다 재조회하지 않는다 */
export const NOTICE_LIST_STALE_TIME_MS = 5 * 60 * 1000;

/** 첫 로딩 스켈레톤 행 개수(settings-uiux.md 4.7 S8) */
export const NOTICE_SKELETON_ROW_COUNT = 3;

/** 상세 본문 줄간격 1.6(settings-uiux.md 4.7 S9) — 글자 크기에 곱한다 */
export const NOTICE_BODY_LINE_HEIGHT_RATIO = 1.6;
