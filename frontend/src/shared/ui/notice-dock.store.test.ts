import { afterEach, describe, expect, it } from '@jest/globals';

import { floatingNoticeBottom, useNoticeDockStore } from './notice-dock.store';

afterEach(() => useNoticeDockStore.setState({ insets: {}, bottom: 0 }));

describe('임시 안내와 하단 독 간격', () => {
  it('미니플레이어가 있으면 창 좌표의 윗면보다 8pt 위에 둔다', () => {
    expect(floatingNoticeBottom(844, 666, 83, 34)).toBe(186);
  });
  it('미니플레이어가 없으면 실측 탭 높이, 탭 밖이면 안전영역을 따른다', () => {
    expect(floatingNoticeBottom(844, null, 83, 34)).toBe(91);
    expect(floatingNoticeBottom(844, null, 0, 34)).toBe(42);
  });
  it('제자리 검색 호스트를 해제해도 부모 화면의 여백을 유지한다', () => {
    const store = useNoticeDockStore.getState();
    store.set('explore', 186);
    store.set('search', 186);
    store.set('search', null);
    expect(useNoticeDockStore.getState().bottom).toBe(186);
    store.set('explore', null);
    expect(useNoticeDockStore.getState().bottom).toBe(0);
  });
});
