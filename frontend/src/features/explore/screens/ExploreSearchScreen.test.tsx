import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { ActivityIndicator, Animated, BackHandler, Keyboard, Platform } from 'react-native';

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
jest.mock('../components/ExploreTile', () => () => null);

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
