import { describe, expect, it } from '@jest/globals';
import type { NavigationState } from '@react-navigation/native';

import { focusedRouteName } from './focused-route';

/** Root(Main) → MainStack(Tabs, …) → Tabs(Library·Explore·Profile) 의 실제 모양을 흉내 낸다 */
const stack = (routes: NavigationState['routes'], index = routes.length - 1): NavigationState => ({
  key: `stack-${routes.length}`,
  index,
  routeNames: routes.map((r) => r.name),
  routes,
  type: 'stack',
  stale: false,
});

const tabs = (index: number): NavigationState =>
  stack(
    [
      { key: 'Library', name: 'Library' },
      { key: 'Explore', name: 'Explore' },
      { key: 'Profile', name: 'Profile' },
    ],
    index,
  );

const root = (main: NavigationState): NavigationState =>
  stack([{ key: 'Main', name: 'Main', state: main }]);

describe('focusedRouteName — screen_view 에 쓰는 포커스 리프 라우트', () => {
  it('탭만 있으면 선택된 탭 이름이다', () => {
    const state = root(stack([{ key: 'Tabs', name: 'Tabs', state: tabs(1) }]));
    expect(focusedRouteName(state)).toBe('Explore');
  });

  it('플레이어(투명 모달)가 스택 위에 쌓이면 Player 다 — 표시 방식은 라우트 상태와 무관하다', () => {
    const state = root(
      stack([
        { key: 'Tabs', name: 'Tabs', state: tabs(0) },
        { key: 'Player', name: 'Player', params: { contentId: 'c1' } },
      ]),
    );
    expect(focusedRouteName(state)).toBe('Player');
  });

  it('플레이어 위에 상세가 더 쌓이면 ContentDetail 이고, 상세를 닫으면 다시 Player 다', () => {
    const withDetail = root(
      stack([
        { key: 'Tabs', name: 'Tabs', state: tabs(0) },
        { key: 'Player', name: 'Player' },
        { key: 'ContentDetail', name: 'ContentDetail' },
      ]),
    );
    expect(focusedRouteName(withDetail)).toBe('ContentDetail');
    const closed = root(
      stack([
        { key: 'Tabs', name: 'Tabs', state: tabs(0) },
        { key: 'Player', name: 'Player' },
      ]),
    );
    expect(focusedRouteName(closed)).toBe('Player');
  });

  it('index 가 없는 부분 상태는 마지막 라우트를 리프로 본다', () => {
    const partial = {
      routes: [{ name: 'Main', state: { routes: [{ name: 'Tabs' }, { name: 'Player' }] } }],
    };
    expect(focusedRouteName(partial)).toBe('Player');
  });

  it('상태가 없으면 null', () => {
    expect(focusedRouteName(undefined)).toBeNull();
  });
});
