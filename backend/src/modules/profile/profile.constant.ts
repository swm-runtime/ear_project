/**
 * 관심 주제 요약의 **대표 주제 개수**(`profile.md` 4.4).
 *
 * 별도 선정 기준을 두지 않고 서버 응답 순서의 앞 3개다(확정 2026-08-06). 나머지는 화면이
 * `+N`으로 접으며, 상한이 3개이므로 `+N`은 상한 도입 이전 초과 보유자에게만 나타난다.
 */
export const TOP_TOPIC_LIMIT = 3;

/**
 * 주제 분포에서 **개별 항목으로 내려주는 상위 개수**(`profile.md` 4.7).
 * 6위 이하는 `others_ratio` 하나로 묶는다 — 원형 그래프에 조각이 늘어날수록 읽히지 않는다.
 */
export const TOPIC_DISTRIBUTION_TOP_LIMIT = 5;

/**
 * 비율의 총합. **서버가 반올림 조정까지 끝내 정확히 이 값이 되게 한다**
 * (`profile-api.md` 4.1 — 클라이언트는 재정규화하지 않고 그대로 그린다).
 */
export const TOPIC_DISTRIBUTION_TOTAL_RATIO = 100;

/** 주간 그래프의 요일 수 — 월~일 고정 배열(`profile.md` 4.6) */
export const WEEKLY_LISTENING_DAY_COUNT = 7;

/**
 * 주간 청취 상위 %를 **내려주는 상한**(`profile-api.md` 4.1 `listening_top_percent`, KAN-168).
 * 이보다 뒤(하위권)면 `null`이다 — "상위 85%"는 사실상 하위라 기를 꺾는다. 티켓 제안값이며
 * PM 확정 전이다(2026-10-10).
 */
export const LISTENING_TOP_PERCENT_MAX = 50;

/**
 * 주간 카드 "전주보다 N분 더"를 내려주는 **최소 차이**(초, KAN-170). 1분 미만이면 화면이 "0분 더"가 된다.
 * 티켓 제안값이며 PM 확정 전이다(2026-10-11).
 */
export const LISTENING_HIGHLIGHT_MIN_DIFF_SEC = 60;

/**
 * 주제 한 줄(`profile.md` 4.7-1)에서 **한 주제에 쏠렸다**고 보는 1위 비율(%) 하한. 이 이상이면 "안 들어본 주제"를
 * 먼저 권한다. 초깃값이며 데이터를 보고 조정한다(PM 2026-10-24 "청취 상태로 서버가 판정").
 */
export const TOPIC_HIGHLIGHT_CONCENTRATED_RATIO = 60;

/** 주제 한 줄의 "같은 직군 1위"·"안 들어본 주제" 순위를 세는 기간(서비스 날짜 수, 오늘 포함) */
export const TOPIC_HIGHLIGHT_WINDOW_DAYS = 28;

/**
 * "같은 직군 1위"를 보여 주는 **최소 인원**(그 기간에 들은 같은 직군 사용자, 나 제외). 이보다 적으면 집계가 몇 사람의
 * 취향을 그대로 드러낸다 — 내려주지 않는다. 초깃값.
 */
export const PEER_TOP_TOPIC_MIN_LISTENERS = 5;

/** "N주 연속 1위"를 거슬러 보는 주 수(이번 주 포함). 화면 문구가 이 값을 넘지 않는다 */
export const TOP_TOPIC_STREAK_LOOKBACK_WEEKS = 8;

/** "N주 연속 1위"를 내려주는 최소 주 수 — 1주는 연속이 아니다 */
export const TOP_TOPIC_STREAK_MIN_WEEKS = 2;
