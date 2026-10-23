import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import { usePlayerScreen } from './usePlayerScreen';

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
} = { session: mockSession, rate: 1, isRateHydrated: true, queueContext: { kind: 'library' } };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { contentId: mockContentId } }),
  useIsFocused: () => true,
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
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
