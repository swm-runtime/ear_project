/**
 * 서비스 지표 "추천 검증"(2026-10-22) — 창과 상한. 전부 화면 한 장에 들어가는 길이로 정했다. 더 긴 이력은 개인 단위 열람의
 * 범위를 넓히는 일이라(처리 목적 "콘텐츠 편성과 추천 · 서비스 개선"에 필요한 만큼만) 상한을 둔다.
 */

/** 후보 사용자 목록 — 기본·최대 길이 */
export const INSPECTOR_USERS_DEFAULT_LIMIT = 20;
export const INSPECTOR_USERS_MAX_LIMIT = 50;

/** 목록의 `plays_30d`·`completes_30d`와 상세 `listening`의 창(일) */
export const INSPECTOR_LISTENING_DAYS = 30;
/** 상세 `listening` 콘텐츠 수 상한 — 최근 활동 순 */
export const INSPECTOR_LISTENING_LIMIT = 50;

/** 상세 `deliveries`의 창 — 오늘 포함 최근 서비스 날짜 수(05:00 경계) */
export const INSPECTOR_DELIVERY_SERVICE_DAYS = 14;
/** 14일 × (정규 최대 편수 + 탐험) 를 넉넉히 덮는 상한 */
export const INSPECTOR_DELIVERY_LIMIT = 100;

/** 상세 `explanation`의 정규·탐험 후보 표 길이(점수 순) */
export const INSPECTOR_EXPLANATION_TOP_N = 20;

/** 화면이 그대로 보이는 경고 — 점수는 저장되지 않으므로 과거 편성 당시 값이 아니다(`domain.md` 6.1·7.2) */
export const INSPECTOR_EXPLANATION_NOTICE =
  '현재 시점 재계산 — 실제 과거 편성 당시 점수와 다를 수 있다';
