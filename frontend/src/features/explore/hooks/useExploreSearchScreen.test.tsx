import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import type { ExploreSearchRequest } from './useExploreSearchRequest';
import { useExploreSearchScreen, type ExploreSearchEmbedding } from './useExploreSearchScreen';

const mockAddRecentSearch = jest.fn((query: string) => Promise.resolve([query]));
const mockSearchQueryArgs: (string | null)[] = [];
/** (query, exact) 쌍 — 교정 끄기(KAN-239) 검증용 */
const mockSearchQueryCalls: [string | null, boolean][] = [];
let mockRouteParams: { initialQuery?: string } | undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn() }),
  useRoute: () => ({ key: 'ExploreSearch-7', name: 'ExploreSearch', params: mockRouteParams }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueriesData: jest.fn() }),
}));
jest.mock('@/shared/analytics', () => ({ track: jest.fn() }));
jest.mock('@/shared/lib/logger', () => ({ logger: { warn: jest.fn(), debug: jest.fn() } }));
jest.mock('@/shared/ui/GlassSurface', () => ({ HAS_NATIVE_TAB_BAR: false }));
jest.mock('@/shared/ui/toast.store', () => ({
  useToastStore: (selector: (state: { show: () => void }) => unknown) =>
    selector({ show: jest.fn() }),
}));
jest.mock('@/features/library', () => ({ libraryKeys: { all: ['library'] } }));
jest.mock('@/features/player', () => ({
  sendSourceLinkClick: jest.fn(),
  usePlayGate: () => ({
    requestPlay: jest.fn(),
    confirmState: null,
    confirmPlay: jest.fn(),
    cancelConfirm: jest.fn(),
    suppressAndPlay: jest.fn(),
  }),
}));
jest.mock('@/features/share', () => ({
  useDeferredSheetShare: () => ({ requestShare: jest.fn(), handleSheetDismiss: jest.fn() }),
}));
jest.mock('../api/explore.api', () => ({ exploreKeys: { all: ['explore'] } }));
jest.mock('./useExploreSearchQuery', () => ({
  useExploreSearchQuery: (query: string | null, exact = false) => {
    mockSearchQueryArgs.push(query);
    mockSearchQueryCalls.push([query, exact]);
    return {
      data: undefined,
      error: null,
      isError: false,
      isFetching: query !== null,
      isPlaceholderData: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      refetch: jest.fn(),
      fetchNextPage: jest.fn(),
    };
  },
}));
jest.mock('./useExploreTopicsQuery', () => ({ useExploreTopicsQuery: () => ({ data: [] }) }));
jest.mock('./useSaveContentMutation', () => ({
  useSaveContentMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('./useUnsaveContentMutation', () => ({
  useUnsaveContentMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('../services/recent-searches.service', () => ({
  loadRecentSearches: () => Promise.resolve([]),
  addRecentSearch: (query: string) => mockAddRecentSearch(query),
  removeRecentSearch: () => Promise.resolve([]),
  clearRecentSearches: () => Promise.resolve([]),
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void | Promise<void>): Promise<void> | void;
  create(element: ReactNode): { update(element: ReactNode): void; unmount(): void };
}>('react-test-renderer');

let screen: ReturnType<typeof useExploreSearchScreen>;
function Probe({ embedding }: { embedding?: ExploreSearchEmbedding }) {
  const current = useExploreSearchScreen(embedding);
  useEffect(() => {
    screen = current;
  });
  return null;
}

const embeddingWith = (searchRequest: ExploreSearchRequest | null): ExploreSearchEmbedding => ({
  onExit: jest.fn(),
  onOpenTopic: jest.fn(),
  remaining: null,
  onRingPress: jest.fn(),
  searchRequest,
});

let renderer: ReturnType<typeof create> | null = null;
const render = async (element: ReactNode) => {
  await act(async () => {
    renderer = create(element);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchQueryArgs.length = 0;
  mockSearchQueryCalls.length = 0;
  mockRouteParams = undefined;
});
afterEach(() => {
  if (renderer) void act(() => renderer?.unmount());
  renderer = null;
});

describe('useExploreSearchScreen — 태그 검색(KAN-219)', () => {
  describe('질의를 넘긴 검색(태그 탭)', () => {
    it('제자리 검색에 `#태그` 요청이 오면 검색창을 채우고 디바운스 없이 즉시 검색한다', async () => {
      // given — 타이머를 진행시키지 않는다(디바운스 300ms 를 기다리지 않아야 한다)
      jest.useFakeTimers();

      // when
      await render(<Probe embedding={embeddingWith({ query: '#뱅크런', id: 1 })} />);

      // then
      expect(screen.inputText).toBe('#뱅크런');
      expect(screen.activeQuery).toBe('#뱅크런');
      expect(screen.isInitialMode).toBe(false);
      expect(mockSearchQueryArgs).toContain('#뱅크런');
      jest.useRealTimers();
    });

    it('태그 탭은 최근 검색어에 `#태그` 그대로 저장한다(4.5-4 — 사용자 행동으로 이어진 검색)', async () => {
      // when
      await render(<Probe embedding={embeddingWith({ query: '#뱅크런', id: 1 })} />);

      // then
      expect(mockAddRecentSearch).toHaveBeenCalledWith('#뱅크런');
      expect(screen.recentSearches).toEqual(['#뱅크런']);
    });

    it('이미 열린 검색에 새 요청(id 변경)이 오면 그 질의로 다시 검색한다', async () => {
      // given
      await render(<Probe embedding={embeddingWith({ query: '#뱅크런', id: 1 })} />);

      // when
      await act(async () => {
        renderer?.update(<Probe embedding={embeddingWith({ query: '#금리', id: 2 })} />);
      });

      // then
      expect(screen.inputText).toBe('#금리');
      expect(screen.activeQuery).toBe('#금리');
      expect(mockAddRecentSearch).toHaveBeenLastCalledWith('#금리');
    });

    it('같은 요청(id 동일)으로 다시 그려져도 다시 저장하지 않는다', async () => {
      // given
      const request = { query: '#뱅크런', id: 1 };
      await render(<Probe embedding={embeddingWith(request)} />);

      // when
      await act(async () => {
        renderer?.update(<Probe embedding={embeddingWith(request)} />);
      });

      // then
      expect(mockAddRecentSearch).toHaveBeenCalledTimes(1);
    });

    it('스택 검색 화면은 라우트 파람 initialQuery 로 즉시 검색한다', async () => {
      // given
      mockRouteParams = { initialQuery: '#뱅크런' };

      // when
      await render(<Probe />);

      // then
      expect(screen.activeQuery).toBe('#뱅크런');
      expect(mockAddRecentSearch).toHaveBeenCalledWith('#뱅크런');
    });

    it('검색창으로 연 검색(요청 없음)은 초기 화면부터다', async () => {
      // when
      await render(<Probe embedding={embeddingWith(null)} />);

      // then
      expect(screen.inputText).toBe('');
      expect(screen.isInitialMode).toBe(true);
      expect(mockAddRecentSearch).not.toHaveBeenCalled();
    });
  });

  describe('검색창 직접 입력', () => {
    it.each(['#', '#a', '# a'])(
      '`%s` 를 입력하면 요청하지 않고 "검색어를 입력해주세요"를 유지한다',
      async (text) => {
        // given
        jest.useFakeTimers();
        await render(<Probe embedding={embeddingWith(null)} />);

        // when
        await act(async () => {
          screen.handleChangeText(text);
          jest.advanceTimersByTime(1000);
        });

        // then
        expect(screen.activeQuery).toBeNull();
        expect(screen.showEmptyPrompt).toBe(true);
        expect(mockSearchQueryArgs.every((query) => query === null)).toBe(true);
        jest.useRealTimers();
      },
    );

    it('`#뱅크런` 을 입력하면 디바운스 뒤 가공 없이 그대로 검색한다', async () => {
      // given
      jest.useFakeTimers();
      await render(<Probe embedding={embeddingWith(null)} />);

      // when
      await act(async () => {
        screen.handleChangeText('#뱅크런');
        jest.advanceTimersByTime(300);
      });

      // then
      expect(screen.activeQuery).toBe('#뱅크런');
      expect(screen.showEmptyPrompt).toBe(false);
      jest.useRealTimers();
    });
  });
});

describe('useExploreSearchScreen — 교정 끄기(KAN-239 "원본 검색 ‘OO’")', () => {
  /** 훅이 쿼리 훅에 넘긴 (query, exact) 쌍 — 모듈 mock 이 쌓는다 */
  const lastSearchArgs = () => mockSearchQueryCalls[mockSearchQueryCalls.length - 1];

  it('탭하면 같은 질의를 exact=true 로 다시 받고, 원문을 최근 검색어에 저장한다', async () => {
    // given
    await render(<Probe embedding={embeddingWith({ query: '커리오', id: 1 })} />);
    expect(lastSearchArgs()).toEqual(['커리오', false]);
    mockAddRecentSearch.mockClear();

    // when
    await act(async () => {
      screen.searchInsteadExact();
    });

    // then
    expect(lastSearchArgs()).toEqual(['커리오', true]);
    expect(mockAddRecentSearch).toHaveBeenCalledWith('커리오');
  });

  it('검색어를 고쳐 치면 exact 가 false 로 돌아간다 — 새 말은 다시 교정 대상이다', async () => {
    // given
    jest.useFakeTimers();
    await render(<Probe embedding={embeddingWith({ query: '커리오', id: 1 })} />);
    await act(async () => {
      screen.searchInsteadExact();
    });
    expect(lastSearchArgs()).toEqual(['커리오', true]);

    // when
    await act(async () => {
      screen.handleChangeText('면졉');
      jest.advanceTimersByTime(300);
    });

    // then
    expect(lastSearchArgs()).toEqual(['면졉', false]);
    jest.useRealTimers();
  });

  it('초기 화면(질의 없음)에서는 아무 일도 하지 않는다', async () => {
    // given
    await render(<Probe embedding={embeddingWith(null)} />);
    mockAddRecentSearch.mockClear();

    // when
    await act(async () => {
      screen.searchInsteadExact();
    });

    // then
    expect(mockAddRecentSearch).not.toHaveBeenCalled();
    expect(lastSearchArgs()).toEqual([null, false]);
  });
});
