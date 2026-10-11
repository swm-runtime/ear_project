import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import { usePlayerScreen } from './usePlayerScreen';

const mockNavigate = jest.fn();
const mockShareDismiss = jest.fn();
const mockRequestShare = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  addListener: jest.fn((_event: string, callback: () => void) => {
    mockBlur = callback;
    return jest.fn();
  }),
};
let mockBlur: () => void;
let mockContentId = 'content-1';
const mockSession = {
  contentId: 'content-1',
  state: 'ready',
  isBuffering: false,
  meta: { title: '테스트 콘텐츠' },
};
const mockPlaybackState = { session: mockSession, rate: 1, isRateHydrated: true };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { contentId: mockContentId } }),
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
jest.mock('./usePlayGate', () => ({ usePlayGate: () => ({}) }));
jest.mock('../store/playback.store', () => ({
  usePlaybackStore: Object.assign(
    (selector: (state: typeof mockPlaybackState) => unknown) => selector(mockPlaybackState),
    { getState: () => mockPlaybackState },
  ),
}));
jest.mock('../services/playback.service', () => ({
  playbackService: { start: jest.fn(), flushProgress: jest.fn() },
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
