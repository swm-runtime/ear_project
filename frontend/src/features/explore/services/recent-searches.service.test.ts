import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { addRecentSearch, loadRecentSearches } from './recent-searches.service';

const mockStore = new Map<string, string>();
jest.mock('@/shared/storage/secure-storage', () => ({
  secureStorage: {
    get: (key: string) => Promise.resolve(mockStore.get(key) ?? null),
    set: (key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    },
    remove: (key: string) => {
      mockStore.delete(key);
      return Promise.resolve();
    },
  },
}));
jest.mock('@/shared/lib/logger', () => ({ logger: { warn: jest.fn() } }));

beforeEach(() => {
  mockStore.clear();
});

describe('recent-searches.service — 최근 검색어(explore.md 4.5-4)', () => {
  it('태그 질의(`#태그`)는 `#`을 남긴 그대로 맨 앞에 저장한다(KAN-219)', async () => {
    // given
    await addRecentSearch('커리어');

    // when
    const next = await addRecentSearch('#뱅크런');

    // then
    expect(next).toEqual(['#뱅크런', '커리어']);
    expect(await loadRecentSearches()).toEqual(['#뱅크런', '커리어']);
  });

  it('같은 검색어를 다시 저장하면 중복 없이 맨 앞으로 끌어올린다', async () => {
    // given
    await addRecentSearch('#뱅크런');
    await addRecentSearch('커리어');

    // when
    const next = await addRecentSearch('#뱅크런');

    // then
    expect(next).toEqual(['#뱅크런', '커리어']);
  });

  it('`#태그`와 `태그`는 다른 검색어로 따로 남는다 — 서버도 다른 질의로 다룬다(explore-api.md 4.5)', async () => {
    // given
    await addRecentSearch('뱅크런');

    // when
    const next = await addRecentSearch('#뱅크런');

    // then
    expect(next).toEqual(['#뱅크런', '뱅크런']);
  });

  it('10건을 넘으면 가장 오래된 것부터 밀어낸다', async () => {
    // given
    for (let i = 1; i <= 10; i += 1) await addRecentSearch(`검색어${i}`);

    // when
    const next = await addRecentSearch('#뱅크런');

    // then
    expect(next).toHaveLength(10);
    expect(next[0]).toBe('#뱅크런');
    expect(next).not.toContain('검색어1');
  });
});
