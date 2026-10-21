import { toTab } from './to-tab';

describe('toTab', () => {
  it('파라미터 없는 탭 이동은 탭만 고르고 위에 얹힌 화면을 걷는다', () => {
    expect(toTab('Library')).toEqual({ screen: 'Tabs', params: { screen: 'Library' }, pop: true });
    expect(toTab('Explore')).toEqual({ screen: 'Tabs', params: { screen: 'Explore' }, pop: true });
  });

  it('탐색 파라미터는 탭 안 스택의 홈(ExploreHome)으로 싸서 보내고 시리즈 화면을 걷는다', () => {
    expect(toTab('Explore', { searchQuery: '#금리' })).toEqual({
      screen: 'Tabs',
      params: {
        screen: 'Explore',
        params: { screen: 'ExploreHome', params: { searchQuery: '#금리' }, pop: true },
      },
      pop: true,
    });
  });
});
