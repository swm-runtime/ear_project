/**
 * PRD FR-03 / onboarding.md 3 — 관심 주제는 최소 1개·최대 3개다.
 *
 * 상한을 두는 이유는 드립 편성이 여러 주제로 분산되는 것을 막기 위해서이며,
 * **클라이언트의 칩 비활성화는 우회되므로 서버가 반드시 재검증한다**(onboarding.md 8).
 * 같은 상한이 이후 관심사 편집(FR-05, `interest-management.md`)에도 적용된다.
 */
export const MIN_SELECTABLE_TOPIC_COUNT = 1;
export const MAX_SELECTABLE_TOPIC_COUNT = 3;
