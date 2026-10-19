import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AppStateStatus } from 'react-native';

import { PROBE_MILESTONES, startBackgroundStoreProbe } from './background-store-probe';

type Crumb = { category?: string; message?: string; level?: string; data?: unknown };
const mockAddBreadcrumb = jest.fn<(crumb: Crumb) => void>();
jest.mock('./sentry', () => ({ addBreadcrumb: (crumb: Crumb) => mockAddBreadcrumb(crumb) }));

type Listener = (state: unknown, previous: unknown) => void;

/** zustand 모양의 가짜 스토어 — `emit` 으로 갱신을 흘린다 */
const fakeStore = () => {
  const listeners = new Set<Listener>();
  return {
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (state: unknown, previous: unknown) => listeners.forEach((l) => l(state, previous)),
  };
};

const fakeAppState = (initial: AppStateStatus = 'active') => {
  let handler: ((status: AppStateStatus) => void) | null = null;
  const state = {
    currentState: initial,
    addEventListener: (_: 'change', listener: (status: AppStateStatus) => void) => {
      handler = listener;
      return { remove: () => (handler = null) };
    },
    go: (status: AppStateStatus) => {
      state.currentState = status;
      handler?.(status);
    },
  };
  return state;
};

const lastCrumb = () => mockAddBreadcrumb.mock.calls.at(-1)?.[0];

beforeEach(() => {
  mockAddBreadcrumb.mockClear();
});

describe('백그라운드 스토어 갱신 진단', () => {
  it('비활성 동안의 갱신만 세고, 돌아올 때 스토어·필드별 횟수와 재생 여부를 breadcrumb 으로 남긴다', () => {
    const playback = fakeStore();
    const sleep = fakeStore();
    const appState = fakeAppState();
    let nowMs = 1_000;
    let playing = true;
    startBackgroundStoreProbe({
      stores: { playback, sleepTimer: sleep },
      appState,
      now: () => nowMs,
      isPlaying: () => playing,
    });

    // 전경에서의 갱신은 세지 않는다
    playback.emit({ a: 1 }, { a: 0 });
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();

    appState.go('background');
    expect(lastCrumb()?.data).toEqual({ leftWhile: 'background', isPlaying: true });

    playback.emit({ isBuffering: true, positionSec: 1 }, { isBuffering: false, positionSec: 1 });
    playback.emit({ isBuffering: false, positionSec: 1 }, { isBuffering: true, positionSec: 1 });
    sleep.emit({ remainingSec: 9, tick: () => 1 }, { remainingSec: 10, tick: () => 1 });

    nowMs += 27 * 60_000;
    playing = false;
    appState.go('active');

    const crumb = lastCrumb();
    expect(crumb?.message).toBe('화면에 돌아옴 — 비활성 1620초 동안 스토어 갱신 3회');
    expect(crumb?.data).toEqual({
      durationSec: 1620,
      leftWhile: 'background',
      isPlayingAtExit: true,
      isPlayingAtReturn: false,
      total: 3,
      byStore: { playback: 2, sleepTimer: 1 },
      // 함수 필드(tick)는 세지 않는다 — 값이 바뀐 필드만
      byKey: { 'playback.isBuffering': 2, 'sleepTimer.remainingSec': 1 },
    });

    // 돌아온 뒤의 갱신은 다시 세지 않는다
    mockAddBreadcrumb.mockClear();
    playback.emit({ a: 2 }, { a: 1 });
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
  });

  it('inactive 도 비활성으로 세고, inactive → background 는 창을 새로 열지 않는다', () => {
    const store = fakeStore();
    const appState = fakeAppState();
    startBackgroundStoreProbe({ stores: { store }, appState, now: () => 0 });

    appState.go('inactive');
    store.emit({ x: 1 }, { x: 0 });
    appState.go('background');
    store.emit({ x: 2 }, { x: 1 });
    appState.go('active');

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(2);
    expect(lastCrumb()?.data).toMatchObject({ leftWhile: 'inactive', total: 2 });
  });

  it('쿼리 캐시는 updated 이벤트만 센다', () => {
    let listener: ((event: { type: string }) => void) | null = null;
    const queryCache = {
      subscribe: (l: (event: { type: string }) => void) => {
        listener = l;
        return () => undefined;
      },
    };
    const appState = fakeAppState();
    startBackgroundStoreProbe({ stores: {}, queryCache, appState, now: () => 0 });

    appState.go('background');
    listener!({ type: 'updated' });
    listener!({ type: 'observerAdded' });
    listener!({ type: 'updated' });
    appState.go('active');

    expect(lastCrumb()?.data).toMatchObject({ total: 2, byStore: { queryCache: 2 } });
  });

  it('갱신이 많이 쌓이면 돌아오기 전에도 중간 breadcrumb 을 남긴다 — 복귀 직후 죽는 경우를 대비해', () => {
    const store = fakeStore();
    const appState = fakeAppState();
    startBackgroundStoreProbe({ stores: { store }, appState, now: () => 0 });

    appState.go('background');
    mockAddBreadcrumb.mockClear();
    for (let i = 0; i < PROBE_MILESTONES[0]; i += 1) store.emit({ n: i + 1 }, { n: i });

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    expect(lastCrumb()).toMatchObject({
      level: 'warning',
      message: `비활성 중 스토어 갱신 ${PROBE_MILESTONES[0]}회 지남`,
    });
    expect(lastCrumb()?.data).toMatchObject({
      total: PROBE_MILESTONES[0],
      byKey: { 'store.n': PROBE_MILESTONES[0] },
    });
  });

  it('이미 비활성인 채로 켜지면 그 시점부터 세고, 끄면 구독을 걷는다', () => {
    const store = fakeStore();
    const appState = fakeAppState('background');
    const stop = startBackgroundStoreProbe({ stores: { store }, appState, now: () => 0 });

    store.emit({ x: 1 }, { x: 0 });
    stop();
    store.emit({ x: 2 }, { x: 1 });
    appState.go('active');

    // 떠남 crumb 하나뿐 — 끈 뒤에는 복귀 crumb 도 갱신 집계도 없다
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    expect(lastCrumb()?.message).toBe('화면을 떠남 — 스토어 갱신을 센다');
  });
});
