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
