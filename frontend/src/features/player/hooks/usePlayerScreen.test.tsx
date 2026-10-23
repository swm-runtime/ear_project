import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { QueryClient as QueryClientType } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';


import type { QueueEntry } from '../player.types';
import { usePlayerScreen } from './usePlayerScreen';
import { queueKeys } from './useQueueQuery';
import { upNextKeys } from './useUpNextQuery';

const mockNavigate = jest.fn();
const mockShareDismiss = jest.fn();
const mockRequestShare = jest.fn();
const mockGoBack = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  setParams: jest.fn(),
  addListener: jest.fn((_event: string, callback: () => void) => {
    mockBlur = callback;
    return jest.fn();
  }),
};
let mockBlur: () => void;
let mockContentId = 'content-1';
const mockRequestPlay = jest.fn();
const mockShowToast = jest.fn();
const mockSaveContent = jest.fn<(contentId: string, seq: number) => Promise<string>>();
let mockQueryClient: QueryClientType;
const mockOpenPaywall = jest.fn();
interface MockSession {
  contentId: string;
  state: string;
  isBuffering: boolean;
  blocked: { kind: 'paywall' | 'paid_limit'; message: string | null } | null;
  durationSec: number;
  meta: {
    title: string;
    authorName: string | null;
    sourceName: string | null;
    thumbnailUrl: string | null;
    topicIds: string[];
  };
}
const mockSession: MockSession = {
  contentId: 'content-1',
  state: 'ready',
  isBuffering: false,
  blocked: null,
  durationSec: 600,
  meta: {
    title: '테스트 콘텐츠',
    authorName: null,
    sourceName: null,
    thumbnailUrl: null,
    topicIds: [],
  },
};
const EXPLORE_CONTEXT = {
  kind: 'explore' as const,
  source: { type: 'search' as const, query: '커리어' },
  items: [],
};
const mockPlaybackState: {
  session: MockSession | null;
  rate: number;
  isRateHydrated: boolean;
  queueContext: { kind: 'library' } | typeof EXPLORE_CONTEXT;
  setQueueContext: (context: { kind: 'library' } | typeof EXPLORE_CONTEXT) => void;
} = {
  session: mockSession,
  rate: 1,
  isRateHydrated: true,
  queueContext: { kind: 'library' },
  setQueueContext: (context) => {
    mockPlaybackState.queueContext = context;
  },
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { contentId: mockContentId } }),
  useIsFocused: () => true,
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));
jest.mock('@/shared/ui/toast.store', () => ({
  useToastStore: (selector: (state: { show: typeof mockShowToast }) => unknown) =>
    selector({ show: mockShowToast }),
}));
jest.mock('@/shared/lib/logger', () => ({ logger: { warn: () => undefined } }));
jest.mock('../services/player-library.bridge', () => ({
  getPlayerLibraryBridge: () => ({ saveContent: mockSaveContent }),
}));
jest.mock('@/shared/analytics', () => ({ track: jest.fn() }));
jest.mock('@/shared/hooks/useDelayedVisible', () => ({ useDelayedVisible: () => false }));
jest.mock('@/features/settings', () => ({ useSettingsQuery: () => ({}) }));
jest.mock('@/features/share', () => ({
  useDeferredSheetShare: () => ({
    requestShare: mockRequestShare,
    handleSheetDismiss: mockShareDismiss,
  }),
}));
jest.mock('./usePlayGate', () => ({
  usePlayGate: () => ({ requestPlay: mockRequestPlay, openPaywall: mockOpenPaywall }),
}));
jest.mock('../store/playback.store', () => ({
  usePlaybackStore: Object.assign(
    (selector: (state: typeof mockPlaybackState) => unknown) => selector(mockPlaybackState),
    { getState: () => mockPlaybackState },
  ),
}));
jest.mock('../services/playback.service', () => ({
  playbackService: { start: jest.fn(), flushProgress: jest.fn(), clearSession: jest.fn() },
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): { update(element: ReactNode): void; unmount(): void };
}>('react-test-renderer');
let screen: ReturnType<typeof usePlayerScreen>;
let renderer: ReturnType<typeof create>;
function Probe() {
  const current = usePlayerScreen();
  useEffect(() => {
    screen = current;
  });
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  const { QueryClient } = jest.requireActual<{ QueryClient: new () => QueryClientType }>(
    '@tanstack/react-query',
  );
  mockQueryClient = new QueryClient();
  mockContentId = 'content-1';
  mockPlaybackState.session = mockSession;
  mockPlaybackState.queueContext = { kind: 'library' };
  act(() => {
    renderer = create(<Probe />);
  });
  act(() => screen.openMoreSheet());
});
afterEach(() => {
  act(() => renderer.unmount());
  mockQueryClient.clear();
});

describe('플레이어 상세 이동 — 더보기 메뉴 닫힘 완료를 기다린다', () => {
  it('딤·메뉴 퇴장 중에는 이동하지 않고 닫힘 뒤 한 번 이동한다', () => {
    act(() => screen.openDetail());
    expect(screen.isMoreSheetVisible).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    act(() => screen.handleMoreSheetDismiss());
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('Main', {
      screen: 'ContentDetail',
      params: { contentId: 'content-1', entryPoint: 'player' },
    });
    act(() => screen.handleMoreSheetDismiss());
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('일반 닫기는 상세 화면을 열지 않는다', () => {
    act(() => screen.closeMoreSheet());
    act(() => screen.handleMoreSheetDismiss());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('공유 요청과 닫힘 완료 전달을 유지한다', () => {
    act(() => screen.sharePress());
    expect(screen.isMoreSheetVisible).toBe(false);
    expect(mockRequestShare).toHaveBeenCalledWith({
      contentId: 'content-1',
      title: '테스트 콘텐츠',
    });
    act(() => screen.handleMoreSheetDismiss());
    expect(mockShareDismiss).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('플레이어를 떠났다면 늦은 닫힘 콜백으로 이동하지 않는다', () => {
    act(() => screen.openDetail());
    act(() => mockBlur());
    act(() => screen.handleMoreSheetDismiss());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('콘텐츠가 바뀌면 이전 콘텐츠로 가려던 이동을 취소한다', () => {
    act(() => screen.openDetail());
    mockContentId = 'content-2';
    act(() => renderer.update(<Probe />));
    act(() => screen.handleMoreSheetDismiss());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('세션 없음의 출구(KAN-257) — 열린 플레이어가 흰 화면에 갇히지 않는다', () => {
  it('보던 세션이 사라지면 플레이어를 한 번 닫는다', () => {
    mockPlaybackState.session = null;
    act(() => renderer.update(<Probe />));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    act(() => renderer.update(<Probe />));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('세션을 한 번도 보지 못한 첫 프레임(미니플레이어 확대·딥링크 진입)에는 닫지 않는다', () => {
    act(() => renderer.unmount());
    mockPlaybackState.session = null;
    act(() => {
      renderer = create(<Probe />);
    });
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('축소로 이미 닫는 중이면 세션이 사라져도 다시 닫지 않는다', () => {
    act(() => screen.collapse());
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    mockPlaybackState.session = null;
    act(() => renderer.update(<Probe />));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});

describe('완료 상태 ▶ 다시 듣기는 재생 목록 맥락을 이어 간다(KAN-258)', () => {
  const endWith = (queueContext: typeof mockPlaybackState.queueContext) => {
    mockPlaybackState.session = { ...mockSession, state: 'ended' };
    mockPlaybackState.queueContext = queueContext;
    act(() => renderer.update(<Probe />));
  };

  it('탐색 맥락에서 끝까지 들은 편의 ▶는 그 맥락을 게이트에 넘긴다', () => {
    endWith(EXPLORE_CONTEXT);
    act(() => screen.handlePlayPausePress());
    expect(mockRequestPlay).toHaveBeenCalledTimes(1);
    expect(mockRequestPlay).toHaveBeenCalledWith(
      expect.objectContaining({
        contentId: 'content-1',
        restartFromBeginning: true,
        queue: EXPLORE_CONTEXT,
      }),
      'player',
    );
  });

  it('라이브러리 맥락이면 라이브러리 맥락 그대로다', () => {
    endWith({ kind: 'library' });
    act(() => screen.handlePlayPausePress());
    expect(mockRequestPlay).toHaveBeenCalledWith(
      expect.objectContaining({ queue: { kind: 'library' } }),
      'player',
    );
  });

  it('플레이어에서 막혀 결제 안내로 갈 때 다시 틀 대상에 그 시점 맥락을 싣는다', () => {
    mockPlaybackState.queueContext = EXPLORE_CONTEXT;
    mockPlaybackState.session = {
      ...mockSession,
      state: 'blocked',
      blocked: { kind: 'paywall', message: null },
    };
    act(() => renderer.update(<Probe />));
    expect(mockOpenPaywall).toHaveBeenCalledWith('player', undefined, {
      contentId: 'content-1',
      isCountedToday: false,
      queue: EXPLORE_CONTEXT,
    });
  });
});

describe('추천 줄 담기는 추천 캐시에 반영된다(KAN-259)', () => {
  const recommended = (contentId: string): QueueEntry => ({
    itemId: null,
    contentId,
    title: contentId,
    authorName: null,
    sourceName: null,
    thumbnailUrl: null,
    durationSec: 600,
    isCountedToday: false,
    isCompleted: false,
    topicIds: [],
  });
  const UP_NEXT_KEY = upNextKeys.of('content-1');
  const upNextItemIdOf = (contentId: string) =>
    mockQueryClient
      .getQueryData<{ pages: QueueEntry[][] }>(UP_NEXT_KEY)
      ?.pages.flat()
      .find((item) => item.contentId === contentId)?.itemId;
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const deferred = () => {
    let resolve: (value: string) => void = () => undefined;
    let reject: (error: unknown) => void = () => undefined;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  beforeEach(() => {
    mockQueryClient.setQueryData(UP_NEXT_KEY, {
      pages: [[recommended('rec-1'), recommended('rec-2')]],
      pageParams: [{ seeds: ['content-1'], shownIds: [] }],
    });
  });

  it('탐색 맥락 — 밀어 담으면 그 줄의 itemId 가 바로 채워지고 성공하면 실제 값이 된다', async () => {
    mockPlaybackState.queueContext = EXPLORE_CONTEXT;
    const save = deferred();
    mockSaveContent.mockReturnValueOnce(save.promise);
    const invalidate = jest.spyOn(mockQueryClient, 'invalidateQueries');

    act(() => screen.saveQueueItem(recommended('rec-1')));
    // 낙관 반영 — 다시 밀어도 담기 면이 드러나지 않는다(canSave = itemId === null)
    expect(upNextItemIdOf('rec-1')).toBe('optimistic-rec-1');
    expect(upNextItemIdOf('rec-2')).toBeNull();

    save.resolve('item-1');
    await flush();
    expect(upNextItemIdOf('rec-1')).toBe('item-1');
    expect(mockShowToast).toHaveBeenCalledWith('라이브러리에 담았어요');
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queueKeys.all });
  });

  it('라이브러리 맥락 — 성공 뒤 재생 목록 캐시를 다시 받는다', async () => {
    mockSaveContent.mockResolvedValueOnce('item-1');
    const invalidate = jest.spyOn(mockQueryClient, 'invalidateQueries');

    act(() => screen.saveQueueItem(recommended('rec-1')));
    await flush();
    expect(upNextItemIdOf('rec-1')).toBe('item-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queueKeys.all });
  });

  it('실패하면 담기 면이 다시 드러나고(itemId null) 실패 토스트가 뜬다', async () => {
    mockSaveContent.mockRejectedValueOnce(new Error('network'));

    act(() => screen.saveQueueItem(recommended('rec-1')));
    await flush();
    expect(upNextItemIdOf('rec-1')).toBeNull();
    expect(mockShowToast).toHaveBeenCalledWith('담지 못했어요. 다시 시도해주세요');
  });

  it('같은 편을 다시 담으면 앞 요청의 늦은 결과는 버린다(saveSeqRef)', async () => {
    const first = deferred();
    const second = deferred();
    mockSaveContent.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    act(() => screen.saveQueueItem(recommended('rec-1')));
    act(() => screen.saveQueueItem(recommended('rec-1')));
    first.reject(new Error('late'));
    await flush();
    expect(upNextItemIdOf('rec-1')).toBe('optimistic-rec-1');
    expect(mockShowToast).not.toHaveBeenCalled();

    second.resolve('item-1');
    await flush();
    expect(upNextItemIdOf('rec-1')).toBe('item-1');
  });
});
