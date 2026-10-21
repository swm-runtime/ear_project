import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  FlatList,
  Keyboard,
  Platform,
  Text as RNText,
} from 'react-native';

import InlineNotice from '@/shared/ui/InlineNotice';

import { MiniPlayer } from '@/features/player';

import ExploreSkeleton from '../components/ExploreSkeleton';
import SearchInputRow from '../components/SearchInputRow';
import SearchToolbar from '../components/SearchToolbar';
import { useExploreSearchScreen } from '../hooks/useExploreSearchScreen';

// Jest의 기본 iOS 해석과 관계없이 Android가 쓰는 공용 화면을 검사한다.
const ExploreSearchScreen = jest.requireActual<{
  default: typeof import('./ExploreSearchScreen').default;
}>('./ExploreSearchScreen.tsx').default;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<object>('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/shared/navigation/useNativeHeaderInset', () => ({ useNativeHeaderInset: () => 0 }));
jest.mock('@/shared/navigation/useTabScrollToTop', () => ({ useTabScrollToTop: () => null }));
jest.mock('@/shared/ui/GlassSurface', () => ({ HAS_NATIVE_TAB_BAR: false }));
jest.mock('@/features/player', () => ({
  DOCK_SCROLL_PROPS: {},
  MiniPlayer: jest.fn(() => null),
  PlayConfirmDialog: () => null,
  useBottomDockInset: () => 80,
}));
jest.mock('../hooks/useExploreSearchScreen', () => ({ useExploreSearchScreen: jest.fn() }));
jest.mock('../components/SearchInputRow', () => jest.fn(() => null));
jest.mock('../components/SearchToolbar', () => jest.fn(() => null));
jest.mock('../components/RecentSearchList', () => () => null);
jest.mock('../components/SuggestedKeywordChips', () => () => null);
jest.mock('../components/ExploreMoreSheet', () => () => null);
jest.mock('../components/ExploreEntryTile', () => () => null);

interface Renderer {
  root: {
    findByType(type: unknown): { props: Record<string, unknown> };
    findAllByType(type: unknown): unknown[];
  };
  update(element: ReactNode): void;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => Promise<void>): Promise<void>;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Android 탐색 제자리 검색', () => {
  it('검색 실패 안내에서 재시도해도 받아 둔 결과를 그대로 표시한다', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const retrySearch = jest.fn();
    const results = [{ content: { id: 'existing-result' } }];
    jest.mocked(useExploreSearchScreen).mockReturnValue({
      inputText: '경제',
      isInitialMode: false,
      results,
      errorBanner: '인터넷 연결을 확인해주세요',
      retrySearch,
      isRetryingSearch: false,
      playConfirm: null,
    } as unknown as ReturnType<typeof useExploreSearchScreen>);
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(<ExploreSearchScreen />);
    });
    const notice = renderer.root.findByType(InlineNotice).props;
    await act(async () => {
      (notice.action as { onPress: () => void }).onPress();
    });
    expect(retrySearch).toHaveBeenCalledTimes(1);
    expect((renderer.root.findByType(FlatList).props.data as unknown[])[0]).toBe(results[0]);
    await act(async () => {
      renderer.unmount();
    });
  });
  it('채움 검색창·닫기 캡슐을 표시하고 미니플레이어를 중복 생성하지 않는다', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.mocked(useExploreSearchScreen).mockReturnValue({
      inputText: '',
      isInitialMode: true,
      recentSearches: [],
      suggestedTopics: [],
      playConfirm: null,
    } as unknown as ReturnType<typeof useExploreSearchScreen>);
    const close = jest.fn();
    const back = jest.spyOn(BackHandler, 'addEventListener');
    const embedding = {
      remaining: { remaining: 3, limit: 5 },
      onExhaustedPress: jest.fn(),
      onExit: jest.fn(),
      onOpenTopic: jest.fn(),
      onRequestClose: close,
    };
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(<ExploreSearchScreen embedding={embedding} />);
    });
    expect(renderer.root.findByType(SearchInputRow).props.variant).toBe('fill');
    expect(renderer.root.findByType(SearchInputRow).props.onCancel).toBeUndefined();
    expect(renderer.root.findByType(SearchToolbar).props.remaining).toEqual(embedding.remaining);
    expect(renderer.root.findAllByType(MiniPlayer)).toHaveLength(0);
    const backHandler = back.mock.calls.find(([event]) => event === 'hardwareBackPress')![1];
    expect(backHandler({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('닫기 요청 시 키보드를 내리고 퇴장 완료 뒤에만 피드를 복구한다', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const cancel = jest.fn();
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    jest.mocked(useExploreSearchScreen).mockReturnValue({
      inputText: '',
      isInitialMode: true,
      recentSearches: [],
      suggestedTopics: [],
      playConfirm: null,
      cancel,
    } as unknown as ReturnType<typeof useExploreSearchScreen>);
    let completion: Animated.EndCallback | undefined;
    jest.spyOn(Animated, 'sequence').mockReturnValue({
      start: (callback) => {
        completion = callback;
      },
      stop: jest.fn(),
      reset: jest.fn(),
    });
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(
        <ExploreSearchScreen
          embedding={{
            remaining: null,
            onExhaustedPress: jest.fn(),
            onExit: jest.fn(),
            onOpenTopic: jest.fn(),
            isClosing: true,
          }}
        />,
      );
    });
    expect(dismiss).toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    completion?.({ finished: false });
    expect(cancel).not.toHaveBeenCalled();
    completion?.({ finished: true });
    expect(cancel).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('첫 검색 결과를 0.3초 넘게 기다리면 스피너 대신 결과 격자 스켈레톤을 그린다', async () => {
    // given
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.mocked(useExploreSearchScreen).mockReturnValue({
      inputText: '경제',
      isInitialMode: false,
      isFirstSearchLoading: true,
      showFirstSearchSkeleton: true,
      results: [],
      recentSearches: [],
      suggestedTopics: [],
      playConfirm: null,
    } as unknown as ReturnType<typeof useExploreSearchScreen>);

    // when
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(
        <ExploreSearchScreen
          embedding={{
            remaining: null,
            onExhaustedPress: jest.fn(),
            onExit: jest.fn(),
            onOpenTopic: jest.fn(),
          }}
        />,
      );
    });

    // then
    expect({
      skeletons: renderer.root.findAllByType(ExploreSkeleton).length,
      spinners: renderer.root.findAllByType(ActivityIndicator).length,
    }).toEqual({ skeletons: 1, spinners: 0 });
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('Android 탐색 제자리 검색 — 검색 안내 2종(KAN-239)', () => {
  interface RoleNode {
    props: Record<string, unknown>;
  }
  interface RoleFinder {
    find(predicate: (node: RoleNode) => boolean): RoleNode;
    findAll(predicate: (node: RoleNode) => boolean): RoleNode[];
  }
  const findTexts = (renderer: Renderer): string[] =>
    (renderer.root.findAllByType(RNText) as { props: { children: unknown } }[])
      .map((node) => node.props.children)
      .filter((child): child is string => typeof child === 'string');
  const baseScreen = {
    inputText: '커리오',
    activeQuery: '커리오',
    isInitialMode: false,
    results: [{ type: 'content', content: { id: 'c1' } }],
    errorBanner: null,
    playConfirm: null,
    isNoResult: false,
    relatedTopics: [],
    fallbackItems: [],
    isRelatedResult: false,
    correctedFrom: null,
    queryUsed: '커리오',
  };

  it('교정 응답이면 격자 위에 "대신 검색했어요" + "원본 검색 ‘…’"(버튼)를 한 줄에 그리고, 탭하면 exact 재검색을 부른다', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const searchInsteadExact = jest.fn();
    jest.mocked(useExploreSearchScreen).mockReturnValue({
      ...baseScreen,
      correctedFrom: '커리오',
      queryUsed: '커리어',
      searchInsteadExact,
    } as unknown as ReturnType<typeof useExploreSearchScreen>);
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(<ExploreSearchScreen />);
    });
    const header = renderer.root.findByType(FlatList).props.ListHeaderComponent as ReactNode;
    let headerRenderer!: Renderer;
    await act(async () => {
      headerRenderer = create(header);
    });
    const texts = findTexts(headerRenderer);
    expect(texts).toContain('‘커리어’로 대신 검색했어요');
    expect(texts).toContain('원본 검색 ‘커리오’');
    // Pressable 은 내부 구성요소로 풀려 타입 검색이 안 된다 — 버튼 역할을 가진 노드로 찾는다
    const button = (headerRenderer.root as unknown as RoleFinder).find(
      (node) => node.props.accessibilityRole === 'button',
    ).props;
    expect(button.accessibilityLabel).toBe('‘커리오’로 검색');
    await act(async () => {
      (button.onPress as () => void)();
    });
    expect(searchInsteadExact).toHaveBeenCalledTimes(1);
    await act(async () => {
      headerRenderer.unmount();
      renderer.unmount();
    });
  });

  it('관련 결과(match: related)면 한 줄만 — 버튼이 없다', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.mocked(useExploreSearchScreen).mockReturnValue({
      ...baseScreen,
      isRelatedResult: true,
    } as unknown as ReturnType<typeof useExploreSearchScreen>);
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(<ExploreSearchScreen />);
    });
    const header = renderer.root.findByType(FlatList).props.ListHeaderComponent as ReactNode;
    let headerRenderer!: Renderer;
    await act(async () => {
      headerRenderer = create(header);
    });
    expect(findTexts(headerRenderer)).toEqual(['‘커리오’와 관련된 결과예요']);
    expect(
      (headerRenderer.root as unknown as RoleFinder).findAll(
        (node) => node.props.accessibilityRole === 'button',
      ),
    ).toHaveLength(0);
    await act(async () => {
      headerRenderer.unmount();
      renderer.unmount();
    });
  });

  it('교정도 관련 결과도 아니면 안내가 없다(종전 화면)', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest
      .mocked(useExploreSearchScreen)
      .mockReturnValue(baseScreen as unknown as ReturnType<typeof useExploreSearchScreen>);
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(<ExploreSearchScreen />);
    });
    expect(renderer.root.findByType(FlatList).props.ListHeaderComponent).toBeNull();
    await act(async () => {
      renderer.unmount();
    });
  });
});
