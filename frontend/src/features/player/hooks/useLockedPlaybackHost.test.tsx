/**
 * KAN-302 — 플레이어가 안 떠 있을 때의 재생 차단·자동 재생 잠금 멈춤을 시트로 잇는 호스트. 게이트·서비스는 가짜로 끼우고, 어떤 시트를
 * 어떤 대상으로 여는지만 본다. 자동 재생이 기록을 남기는 쪽은 playback.service.test 가 본다.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import type { PlaybackSession, QueueEntry } from '../player.types';
import { takeLockedNextTarget, useLockedPlaybackHost } from './useLockedPlaybackHost';
import type { PlayGateTarget } from './usePlayGate';
import { useLimitNoticeStore } from '../store/limit-notice.store';
import { usePlaybackStore } from '../store/playback.store';

type Opener = (entry: string, message?: string, blocked?: PlayGateTarget) => void;
const mockOpenSeriesLock = jest.fn<Opener>();
const mockOpenPaywall = jest.fn<Opener>();
const mockClearSession = jest.fn();

jest.mock('./usePlayGate', () => ({
  usePlayGate: () => ({
    confirmState: null,
    confirmPlay: jest.fn(),
    cancelConfirm: jest.fn(),
    suppressAndPlay: jest.fn(),
    openSeriesLock: (...args: Parameters<Opener>) => mockOpenSeriesLock(...args),
    openPaywall: (...args: Parameters<Opener>) => mockOpenPaywall(...args),
  }),
}));
jest.mock('../services/playback.service', () => ({
  playbackService: { clearSession: () => mockClearSession() },
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): { update(element: ReactNode): void; unmount(): void };
}>('react-test-renderer');

const ENDED_ID = 'c0ffee00-0000-4000-8000-000000000001';
const LOCKED_ID = 'c0ffee00-0000-4000-8000-000000000002';

const sessionOf = (patch: Partial<PlaybackSession>): PlaybackSession =>
  ({
    contentId: ENDED_ID,
    state: 'ended',
    blocked: null,
    meta: {
      title: '3화',
      authorName: null,
      sourceName: null,
      sourceUrl: null,
      thumbnailUrl: null,
      contentVersion: null,
      topicIds: [],
    },
    ...patch,
  }) as PlaybackSession;

const lockedEntry: QueueEntry = {
  itemId: null,
  contentId: LOCKED_ID,
  title: '4화',
  authorName: null,
  sourceName: null,
  thumbnailUrl: 'https://example.com/4.jpg',
  durationSec: 600,
  isCountedToday: false,
  isCompleted: false,
  topicIds: ['t1'],
  isLocked: true,
};

const SERIES_CONTEXT = {
  kind: 'explore' as const,
  source: { type: 'series' as const, title: '시리즈' },
  items: [lockedEntry],
};

function Host({ isPlayerOpen }: { isPlayerOpen: boolean }) {
  useLockedPlaybackHost(isPlayerOpen);
  return null;
}

let renderer: { update(element: ReactNode): void; unmount(): void } | null = null;
const mount = (isPlayerOpen: boolean) => {
  act(() => {
    renderer = create(<Host isPlayerOpen={isPlayerOpen} />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  usePlaybackStore.setState({ session: null, lockedNext: null, queueContext: { kind: 'library' } });
  useLimitNoticeStore.getState().hide();
});
afterEach(() => {
  if (renderer) act(() => renderer?.unmount());
  renderer = null;
});

describe('자동 재생이 잠긴 다음 편 앞에서 멈췄을 때(KAN-302)', () => {
  it('플레이어가 안 떠 있으면 그 편을 대상으로 잠금 시트를 연다 — 결제 뒤 같은 목록으로 이어 튼다', () => {
    // given
    usePlaybackStore.setState({ session: sessionOf({}) });
    mount(false);

    // when
    act(() => {
      usePlaybackStore.getState().setLockedNext({
        afterContentId: ENDED_ID,
        entry: lockedEntry,
        queue: SERIES_CONTEXT,
      });
    });

    // then
    expect(mockOpenSeriesLock).toHaveBeenCalledTimes(1);
    const [entry, message, target] = mockOpenSeriesLock.mock.calls[0];
    expect(entry).toBe('player');
    expect(message).toBeUndefined();
    expect(target).toMatchObject({
      contentId: LOCKED_ID,
      isLocked: true,
      queue: SERIES_CONTEXT,
      meta: { title: '4화', thumbnailUrl: 'https://example.com/4.jpg', topicIds: ['t1'] },
    });
    // 한 번만 — 기록을 꺼내면 지운다
    expect(usePlaybackStore.getState().lockedNext).toBeNull();
    // 듣던 편 세션은 남긴다
    expect(mockClearSession).not.toHaveBeenCalled();
  });

  it('플레이어가 떠 있으면 호스트는 손대지 않는다 — 플레이어 화면이 닫고 띄운다', () => {
    // given
    usePlaybackStore.setState({ session: sessionOf({}) });
    mount(true);

    // when
    act(() => {
      usePlaybackStore.getState().setLockedNext({
        afterContentId: ENDED_ID,
        entry: lockedEntry,
        queue: SERIES_CONTEXT,
      });
    });

    // then
    expect(mockOpenSeriesLock).not.toHaveBeenCalled();
    expect(usePlaybackStore.getState().lockedNext).not.toBeNull();
  });

  it('그사이 다른 편으로 넘어갔으면 시트를 띄우지 않고 기록만 버린다', () => {
    // given
    usePlaybackStore.setState({
      session: sessionOf({ contentId: 'c0ffee00-0000-4000-8000-000000000009', state: 'ready' }),
      lockedNext: { afterContentId: ENDED_ID, entry: lockedEntry, queue: SERIES_CONTEXT },
    });

    // when
    const target = takeLockedNextTarget();

    // then
    expect(target).toBeNull();
    expect(usePlaybackStore.getState().lockedNext).toBeNull();
  });
});

describe('미니플레이어 상태에서 듣던 편이 막혔을 때(KAN-302)', () => {
  it('잠금 403 이면 세션을 내리고 그 편을 대상으로 잠금 시트를 연다', () => {
    // given
    usePlaybackStore.setState({ queueContext: SERIES_CONTEXT });
    mount(false);

    // when
    act(() => {
      usePlaybackStore.setState({
        session: sessionOf({
          state: 'blocked',
          blocked: { kind: 'series_locked', message: '이 편은 프로 구독에서 들을 수 있어요' },
        }),
      });
    });

    // then
    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockOpenSeriesLock).toHaveBeenCalledWith(
      'miniplayer',
      '이 편은 프로 구독에서 들을 수 있어요',
      { contentId: ENDED_ID, isCountedToday: false, queue: SERIES_CONTEXT },
    );
  });

  it('한도 403 은 페이월, 유료 한도는 한도 안내 — 플레이어 화면과 같은 갈래', () => {
    // given
    mount(false);

    // when
    act(() => {
      usePlaybackStore.setState({
        session: sessionOf({ state: 'blocked', blocked: { kind: 'paywall', message: null } }),
      });
    });
    act(() => {
      usePlaybackStore.setState({
        session: sessionOf({
          state: 'blocked',
          blocked: { kind: 'paid_limit', message: '오늘은 여기까지' },
        }),
      });
    });

    // then
    expect(mockOpenPaywall).toHaveBeenCalledWith('miniplayer', undefined, expect.anything());
    expect(useLimitNoticeStore.getState().isVisible).toBe(true);
    expect(useLimitNoticeStore.getState().message).toBe('오늘은 여기까지');
  });

  it('플레이어가 떠 있으면 플레이어 화면 몫이라 손대지 않는다', () => {
    // given
    mount(true);

    // when
    act(() => {
      usePlaybackStore.setState({
        session: sessionOf({ state: 'blocked', blocked: { kind: 'series_locked', message: null } }),
      });
    });

    // then
    expect(mockClearSession).not.toHaveBeenCalled();
    expect(mockOpenSeriesLock).not.toHaveBeenCalled();
  });
});
