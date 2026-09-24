import type { NavigationState, PartialState } from '@react-navigation/native';

type AnyNavigationState = NavigationState | PartialState<NavigationState>;

/**
 * 지금 보이는 화면의 라우트 이름 — 중첩 내비게이터를 끝까지 따라 내려간다(PushArrivalBanner 와 같은 규칙).
 * 스택 위에 쌓인 화면(플레이어 `transparentModal` 포함)은 그 스택의 `index` 가 가리키므로 리프로 잡힌다 —
 * 표시 방식(투명 모달·애니메이션 없음)은 라우트 상태에 영향을 주지 않는다.
 */
export const focusedRouteName = (state: AnyNavigationState | undefined): string | null => {
  let current: AnyNavigationState | undefined = state;
  let name: string | null = null;
  while (current) {
    const index = current.index ?? current.routes.length - 1;
    const route = current.routes[index];
    if (!route) break;
    name = route.name;
    current = route.state;
  }
  return name;
};
