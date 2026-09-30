/**
 * PRD FR-03 / onboarding.md 3 — 관심 주제는 최소 1개·최대 3개다.
 *
 * 상한을 두는 이유는 드립 편성이 여러 주제로 분산되는 것을 막기 위해서이며,
 * **클라이언트의 칩 비활성화는 우회되므로 서버가 반드시 재검증한다**(onboarding.md 8).
 * 같은 상한이 이후 관심사 편집(FR-05, `interest-management.md`)에도 적용된다.
 */
export const MIN_SELECTABLE_TOPIC_COUNT = 1;
export const MAX_SELECTABLE_TOPIC_COUNT = 3;

/**
 * 자동 확장 슬롯 수(`drip-scheduling.md` 4.5 — 개정 2026-09-30). **직접 고른 주제의 상한(3)과 따로 센다.**
 *
 * 상한 3은 "사용자가 고르는 개수"의 규칙이다. 자동 추가분을 그 안에 넣으면 3개를 채운 사용자(대부분)에게는
 * 확장이 영영 동작하지 않고, 넣으려면 사용자가 직접 고른 주제를 시스템이 빼야 한다 — 둘 다 하지 않는다.
 * 자동 슬롯은 시스템이 행동에서 읽은 **가설 하나**이고, 교체·만료는 이 슬롯 안에서만 일어난다.
 */
export const MAX_AUTO_EXPAND_TOPIC_COUNT = 1;

/**
 * 검색 빈 결과 fallback의 "관련 주제" 판정 하한(explore-api.md 4.5 — `related_topics`).
 *
 * 부분 문자열 포함이면 무조건 관련로 보고, 아니면 `pg_trgm` `similarity`가 이 값 이상일
 * 때만 담는다. **잠정 기준값이다** — 한국어는 짧은 텍스트의 정보 밀도가 높아 기본
 * 임계(0.3)보다 낮게 시작하고, 시범 운영 실측으로 조정한다(`explore.md` 4.5-5의 계수와
 * 같은 서버 소유 값).
 */
export const RELATED_TOPIC_SIMILARITY_THRESHOLD = 0.15;
