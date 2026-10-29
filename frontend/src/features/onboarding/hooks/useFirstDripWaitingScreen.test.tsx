/**
 * KAN-295 — 완료 대기(O13)가 첫 드립의 열 편(`first_content_id`)을 온보딩 store 에 적는지. 조회(useQuery)는 가짜로 끼워
 * 넘긴 옵션과 돌려준 데이터만 본다.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';

import type { FirstDripState, FirstDripStatus } from '../onboarding.types';
import { useFirstDripWaitingScreen } from './useFirstDripWaitingScreen';
import { useOnboardingStore } from '../store/onboarding.store';

const mockReset = jest.fn();
let mockQueryData: FirstDripState | undefined;
const mockUseQuery = jest.fn((options: { enabled: boolean }) => {
  void options;
  return { data: mockQueryData };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ reset: mockReset }),
  useFocusEffect: () => undefined,
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: { enabled: boolean }) => mockUseQuery(options),
}));
jest.mock('@/shared/hooks/useDelayedVisible', () => ({ useDelayedVisible: () => false }));
jest.mock('../api/onboarding.api', () => ({
  fetchFirstDripState: jest.fn(),
  onboardingKeys: { firstDrip: () => ['onboarding', 'first-drip'] },
}));
jest.mock('../services/onboarding-completion.service', () => ({
  onboardingCompletionService: { request: () => undefined },
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): { update(element: ReactNode): void; unmount(): void };
}>('react-test-renderer');

let renderer: { update(element: ReactNode): void; unmount(): void } | null = null;
function Probe() {
  useFirstDripWaitingScreen();
  return null;
}

const completeWith = (status: FirstDripStatus) =>
  useOnboardingStore.getState().setCompletion('success', {
    onboardingCompleted: true,
    onboardingStep: 'done',
    pickedCount: 0,
    awaitsFirstDrip: true,
    firstDrip: { status, pollIntervalSec: 1, maxWaitSec: 15 },
  });

const polled = (status: FirstDripStatus, firstContentId: string | null): FirstDripState => ({
  status,
  libraryItemCount: status === 'completed' ? 2 : null,
  completedAt: status === 'completed' ? '2026-10-29T09:12:03Z' : null,
  firstContentId,
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockQueryData = undefined;
  useOnboardingStore.getState().reset();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  jest.useRealTimers();
});

const mount = () =>
  act(() => {
    renderer = create(<Probe />);
  });
const lastEnabled = () => mockUseQuery.mock.calls.at(-1)?.[0].enabled;

describe('useFirstDripWaitingScreen — 첫 드립의 열 편 적기(KAN-295)', () => {
  it('폴링이 completed 와 열 편을 받으면 적어 두고 완료로 간다', () => {
    completeWith('pending');
    mockQueryData = polled('completed', 'content-1');

    mount();

    expect(useOnboardingStore.getState().firstContentId).toBe('content-1');
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('completed 인데 열 편이 null 이면(남은 편 없음·옛 서버) 비워 둔다 — 탐색으로 간다', () => {
    completeWith('pending');
    mockQueryData = polled('completed', null);

    mount();

    expect(useOnboardingStore.getState().firstContentId).toBeNull();
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('완료 응답이 이미 completed 면 열 편을 받으러 한 번 조회하고, 받기 전에는 나가지 않는다', () => {
    completeWith('completed');

    mount();

    expect(lastEnabled()).toBe(true);
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('완료 응답이 queued·no_candidates 면 조회 없이 곧바로 완료로 간다 — 열 편이 없다', () => {
    completeWith('queued');

    mount();

    expect(lastEnabled()).toBe(false);
    expect(useOnboardingStore.getState().firstContentId).toBeNull();
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('대기 상한을 넘기면 열 편 없이 완료로 간다', () => {
    completeWith('pending');
    mount();
    expect(mockReset).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(15_000));

    expect(useOnboardingStore.getState().firstContentId).toBeNull();
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});
