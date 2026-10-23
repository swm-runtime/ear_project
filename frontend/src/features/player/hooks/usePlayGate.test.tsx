/**
 * KAN-257 — 소진 힌트로 발급부터 받는 재생(`startDeferred`)이 듣던 편을 지키는지. 서비스는 가짜로 끼우고, 게이트가 서비스에
 * 넘긴 요청·콜백과 스토어(재생 목록 맥락·한도 안내)만 본다. 듣던 세션을 실제로 지키는 쪽은 playback.service.test 가 본다.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import type { PlayQueueContext } from '../player.types';
import { usePlayGate } from './usePlayGate';
import type { StartPlaybackRequest } from '../services/playback.service';
import { useLimitNoticeStore } from '../store/limit-notice.store';
import { usePlayLimitStore } from '../store/play-limit.store';
import { usePlaybackStore } from '../store/playback.store';

const mockNavigate = jest.fn();
const mockStart = jest.fn<(request: StartPlaybackRequest) => void>();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: () => Promise.resolve([]) }),
}));
jest.mock('@/shared/analytics', () => ({ track: () => undefined }));
jest.mock('./useQueueQuery', () => ({ queueKeys: { all: ['queue'] }, fetchQueueItems: jest.fn() }));
jest.mock('../services/play-confirm-suppression.service', () => ({
  suppressPlayConfirmForToday: () => Promise.resolve(),
}));
jest.mock('../services/playback.service', () => ({
  playbackService: {
    start: (request: StartPlaybackRequest) => mockStart(request),
    playWhenReady: jest.fn(),
    clearSession: jest.fn(),
  },
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): { unmount(): void };
}>('react-test-renderer');

let gate: ReturnType<typeof usePlayGate>;
let renderer: { unmount(): void };
function Probe() {
  const current = usePlayGate();
  useEffect(() => {
    gate = current;
  });
  return null;
}

const EXPLORE_CONTEXT: PlayQueueContext = {
  kind: 'explore',
  source: { type: 'search', query: '커리어' },
  items: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  usePlayLimitStore.setState({
    playLimit: { dailyPlayLimit: 2, dailyPlayCount: 2, serviceDate: '2026-10-24' },
    suppressedServiceDate: null,
  });
  usePlaybackStore.getState().setQueueContext(EXPLORE_CONTEXT);
  useLimitNoticeStore.getState().hide();
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => {
  act(() => renderer.unmount());
});

describe('소진 힌트의 발급 먼저 재생 — 듣던 편을 지킨다(KAN-257)', () => {
  it('듣던 편을 내리지 않는 시작을 요청하고, 막히면 맥락을 그대로 둔 채 페이월만 연다', () => {
    // when — 재생 목록에서 오늘 안 들은 편(라이브러리 맥락으로 바뀌는 요청이라도)을 고른다
    act(() =>
      gate.requestPlay(
        { contentId: 'content-2', isCountedToday: false, queue: { kind: 'library' } },
        'library',
      ),
    );

    // then — 발급부터, 듣던 편은 결과가 나올 때까지 그대로
    expect(mockStart).toHaveBeenCalledTimes(1);
    const request = mockStart.mock.calls[0][0];
    expect(request.autoplay).toBe(false);
    expect(request.keepCurrentUntilIssued).toBe(true);
    // 맥락은 재생이 실제로 바뀔 때까지 쓰지 않는다
    expect(usePlaybackStore.getState().queueContext).toBe(EXPLORE_CONTEXT);

    // when — 발급이 한도 403
    act(() => request.callbacks?.onIssueBlocked?.({ kind: 'paywall', message: null }));

    // then — 페이월이 뜨고 플레이어는 새로 열지 않는다. 맥락도 그대로다
    expect(useLimitNoticeStore.getState().isVisible).toBe(true);
    expect(useLimitNoticeStore.getState().isPaywall).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(usePlaybackStore.getState().queueContext).toBe(EXPLORE_CONTEXT);
  });

  it('서버가 허용해 세션이 바뀌는 순간에 그 요청의 맥락을 쓴다', () => {
    act(() =>
      gate.requestPlay(
        { contentId: 'content-2', isCountedToday: false, queue: { kind: 'library' } },
        'library',
      ),
    );
    const request = mockStart.mock.calls[0][0];
    act(() => request.callbacks?.onBecameCurrent?.());
    expect(usePlaybackStore.getState().queueContext).toEqual({ kind: 'library' });
  });
});
