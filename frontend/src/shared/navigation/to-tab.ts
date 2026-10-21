/**
 * 탭 화면으로 **돌아가는** 내비게이션 파라미터 — `navigation.navigate('Main', toTab('Library'))`.
 *
 * React Navigation 7 의 `navigate`는 스택 아래에 이미 있는 화면으로 **돌아가지 않고 새로 하나 더 쌓는다**
 * (6 까지는 돌아갔다). 탭 위에 얹힌 화면(플레이어·콘텐츠 상세·검색)에서 그냥 부르면 그 위에 탭 화면이
 * 한 벌 더 올라간다 — 플레이어가 모달이라 "라이브러리 안에 라이브러리 모달"로 보이고, 루트의 토스트는
 * 그 밑에 깔려 보이지 않는다(2026-09-20 실기기, KAN-69 확인 중 발견). **`pop: true` 가 있어야 기존 탭으로
 * 되돌아가며 위에 얹힌 화면이 걷힌다.** 탭 안에서 부르면(이미 그 화면이 앞이다) 탭만 바뀐다.
 */
/**
 * 탐색 탭이 받는 파라미터 — 화면이 처리한 뒤 스스로 소거한다(useExploreScreen · useExploreSearchRequest).
 * applyTopicId: 검색 빈 결과(E7)의 관련 주제 칩 복귀 — 그 주제의 단일 목록으로 전환한다.
 * searchQuery: 태그 탭 → 검색 화면을 열고 이 질의로 즉시 검색한다(KAN-219 — 예: `#뱅크런`).
 */
export type ExploreTabParams = { applyTopicId?: string; searchQuery?: string };

export function toTab(tab: 'Library' | 'Profile'): {
  screen: 'Tabs';
  params: { screen: 'Library' | 'Profile' };
  pop: true;
};
export function toTab(
  tab: 'Explore',
  params?: ExploreTabParams,
): { screen: 'Tabs'; params: { screen: 'Explore'; params?: ExploreTabParams }; pop: true };
export function toTab(tab: 'Library' | 'Explore' | 'Profile', params?: ExploreTabParams) {
  return {
    screen: 'Tabs' as const,
    params: params === undefined ? { screen: tab } : { screen: tab, params },
    pop: true as const,
  };
}
