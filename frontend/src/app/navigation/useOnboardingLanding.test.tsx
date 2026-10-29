/**
 * KAN-295 — 온보딩 직후 착지가 첫 콘텐츠를 **푸시 탭과 같은 길**(발급 뒤 멈춘 플레이어)로 여는지, 그리고 여는 동안 안내 모달을
 * 붙드는 신호(`isOpening`)가 언제 풀리는지. 재생 게이트는 가짜로 끼우고 게이트에 넘긴 요청만 본다.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

// 아래 jest.mock 이 두 공개 API 를 실제 store 로 바꿔 끼운다 — 테스트는 공개 API 로만 가져온다
import { useOnboardingLandingStore } from '@/features/onboarding';
import { usePlaybackStore, type PlayEntryPoint, type PlayGateTarget } from '@/features/player';

import { ONBOARDING_LANDING_HOLD_MAX_MS, useOnboardingLanding } from './useOnboardingLanding';

type PlaybackSession = NonNullable<ReturnType<typeof usePlaybackStore.getState>['session']>;

const mockRequestPlay = jest.fn<(target: PlayGateTarget, entryPoint: PlayEntryPoint) => void>();

jest.mock('@/features/onboarding', () => ({
  useOnboardingLandingStore: jest.requireActual<
    typeof import('@/features/onboarding/store/onboarding-landing.store')
  >('@/features/onboarding/store/onboarding-landing.store').useOnboardingLandingStore,
}));
jest.mock('@/features/player', () => ({
  usePlayGate: () => ({ requestPlay: mockRequestPlay }),
  usePlaybackStore: jest.requireActual<typeof import('@/features/player/store/playback.store')>(
    '@/features/player/store/playback.store',
  ).usePlaybackStore,
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): { update(element: ReactNode): void; unmount(): void };
}>('react-test-renderer');

let isOpening = false;
let renderer: { update(element: ReactNode): void; unmount(): void } | null = null;
function Probe({ isPlayerInStack }: { isPlayerInStack: boolean }) {
  const landing = useOnboardingLanding(isPlayerInStack);
  useEffect(() => {
    isOpening = landing.isOpening;
  });
  return null;
}

const mount = (isPlayerInStack = false) =>
  act(() => {
    renderer = create(<Probe isPlayerInStack={isPlayerInStack} />);
  });
const rerender = (isPlayerInStack: boolean) =>
  act(() => renderer?.update(<Probe isPlayerInStack={isPlayerInStack} />));

const sessionOf = (contentId: string, state: PlaybackSession['state']): PlaybackSession =>
  ({ contentId, entryPoint: 'onboarding', state }) as PlaybackSession;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  isOpening = false;
  usePlaybackStore.getState().setSession(null);
  useOnboardingLandingStore.getState().reset();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  jest.useRealTimers();
});

describe('useOnboardingLanding — 온보딩 직후 첫 콘텐츠 열기(KAN-295)', () => {
  it('열 편이 있으면 푸시 탭과 같은 길(발급 뒤 · 멈춘 채)로 onboarding 진입점 재생을 요청하고 대상을 비운다', () => {
    // given — 온보딩 종료가 첫 드립의 first_content_id 를 적어 뒀다
    useOnboardingLandingStore.getState().setPendingFirstContentId('content-1');

    // when — Main 이 뜬다
    mount();

    // then
    expect(mockRequestPlay).toHaveBeenCalledTimes(1);
    const [target, entryPoint] = mockRequestPlay.mock.calls[0];
    expect(entryPoint).toBe('onboarding');
    expect(target).toMatchObject({
      contentId: 'content-1',
      isCountedToday: false,
      openAfterIssue: true,
      openPaused: true,
    });
    expect(useOnboardingLandingStore.getState().pendingFirstContentId).toBeNull();
    // 플레이어가 아직 안 올라왔다 — 안내 모달을 붙든다
    expect(isOpening).toBe(true);
  });

  it('다시 그려져도 한 번만 연다 — 집은 편은 여는 중으로 옮겨 간다', () => {
    useOnboardingLandingStore.getState().setPendingFirstContentId('content-1');
    mount();

    rerender(false);
    rerender(false);

    expect(mockRequestPlay).toHaveBeenCalledTimes(1);
  });

  it('열 편이 없으면(탐색 폴백) 재생을 요청하지 않고 안내 모달도 붙들지 않는다', () => {
    mount();

    expect(mockRequestPlay).not.toHaveBeenCalled();
    expect(isOpening).toBe(false);
  });

  it('플레이어가 스택에 오르면 여는 중이 끝난다 — 그다음은 호출부의 플레이어 신호가 붙든다', () => {
    useOnboardingLandingStore.getState().setPendingFirstContentId('content-1');
    mount();

    rerender(true);

    expect(isOpening).toBe(false);
  });

  it('회수·삭제(404)로 발급이 실패하면 플레이어 없이 풀린다 — 착지(탐색)에 그대로 둔다', () => {
    useOnboardingLandingStore.getState().setPendingFirstContentId('content-1');
    mount();

    act(() => mockRequestPlay.mock.calls[0][0].onNotFound?.());

    expect(isOpening).toBe(false);
  });

  it('발급이 네트워크 등으로 실패한 세션이 되면 풀린다', () => {
    useOnboardingLandingStore.getState().setPendingFirstContentId('content-1');
    mount();

    act(() => usePlaybackStore.getState().setSession(sessionOf('content-1', 'loading')));
    expect(isOpening).toBe(true);
    act(() => usePlaybackStore.getState().setSession(sessionOf('content-1', 'load_failed')));

    expect(isOpening).toBe(false);
  });

  it('이 편의 세션이 섰다가 내려가면(한도 403 — 세션을 내리고 페이월만 연다) 풀린다', () => {
    useOnboardingLandingStore.getState().setPendingFirstContentId('content-1');
    mount();

    act(() => usePlaybackStore.getState().setSession(sessionOf('content-1', 'loading')));
    act(() => usePlaybackStore.getState().setSession(null));

    expect(isOpening).toBe(false);
  });

  it('어떤 신호도 오지 않아도 상한 뒤에는 풀린다 — 알림 사전 안내가 영영 막히지 않는다', () => {
    useOnboardingLandingStore.getState().setPendingFirstContentId('content-1');
    mount();

    act(() => jest.advanceTimersByTime(ONBOARDING_LANDING_HOLD_MAX_MS - 1));
    expect(isOpening).toBe(true);
    act(() => jest.advanceTimersByTime(1));

    expect(isOpening).toBe(false);
  });
});
