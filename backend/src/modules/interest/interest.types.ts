/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

/** onboarding-api.md 4.2 — 주제 목록 조회 결과 */
export interface TopicListResult {
  topics: TopicView[];
  maxSelectable: number;
  /**
   * 관리자가 설정한 노출 주제가 없어 폴백 세트를 내려보낸 상태.
   * **정상 상태가 아니며 서버가 운영 알림을 발생시킨다**(onboarding.md 7).
   */
  isFallback: boolean;
}

export interface TopicView {
  topicId: string;
  name: string;
  parentCategory: string;
}

/**
 * interest-management-api.md 4.2·4.3 — 관심사 관리 화면의 선택 상태.
 *
 * **`is_active = true`이면서 주제가 노출 중인 행만 담는다.** 숨겨진 주제는 칩으로 그릴 수 없어
 * 응답 범위·diff 범위·개수 판정에서 전부 제외한다(`interest-management.md` 7장). `source`는
 * 원값 전달이며 배지 매핑은 화면이 한다.
 */
export interface UserInterestSelectionView {
  topicId: string;
  source: string;
}

/**
 * 관심 주제 요약(`profile-api.md` 4.1 · `settings-api.md` 4.1) — **두 화면이 같은 규칙을 쓴다.**
 *
 * `count`는 **관리자가 숨긴 주제(`topics.is_visible = false`)를 제외한다** — 편집 화면의
 * N/3과 같은 기준이다(팀 결정 2026-08-11: 숨김 주제는 모든 사용자에게서 제거되고 개수도
 * 재계산된다). `topTopics`는 별도 선정 기준 없이 앞 3개이며, 정렬은 **선택한 순서**
 * (`user_interests.created_at`)다 — 탐색 칩과 같은 규칙(`explore-api.md` 4.2-2).
 */
export interface InterestSummaryView {
  count: number;
  topTopics: { id: string; name: string }[];
}
