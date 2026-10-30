import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { exitOnboarding } from './onboarding-exit.service';
import { useOnboardingLandingStore } from '../store/onboarding-landing.store';
import { useOnboardingStore } from '../store/onboarding.store';

const mockMarkOnboardingCompleted = jest.fn();
jest.mock('@/features/auth', () => ({
  sessionService: { markOnboardingCompleted: () => mockMarkOnboardingCompleted() },
  clearReonboardingAfterMarketChange: () => undefined,
}));
jest.mock('./onboarding-completion.service', () => ({
  onboardingCompletionService: { reset: () => undefined },
}));

let landingAtMarkCompleted: string | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  landingAtMarkCompleted = null;
  // Main 이 뜨는 순간(세션 갱신)에 착지 대상이 이미 적혀 있어야 한다
  mockMarkOnboardingCompleted.mockImplementation(() => {
    landingAtMarkCompleted = useOnboardingLandingStore.getState().pendingFirstContentId;
  });
  useOnboardingStore.getState().reset();
  useOnboardingLandingStore.getState().reset();
});

describe('exitOnboarding — 온보딩 직후 열 편 넘기기(KAN-295)', () => {
  it('첫 드립이 정해 준 편을 세션 갱신 전에 착지 store 로 옮기고 온보딩 store 는 비운다', () => {
    // given — 완료 대기(O13)가 첫 드립 completed 응답의 first_content_id 를 적어 뒀다
    useOnboardingStore.getState().setFirstContentId('content-1');

    // when
    exitOnboarding();

    // then
    expect(landingAtMarkCompleted).toBe('content-1');
    expect(useOnboardingLandingStore.getState().pendingFirstContentId).toBe('content-1');
    expect(useOnboardingStore.getState().firstContentId).toBeNull();
    expect(mockMarkOnboardingCompleted).toHaveBeenCalledTimes(1);
  });

  it('열 편이 없으면(no_candidates·queued·대기 초과·옛 서버) 착지 대상을 적지 않는다 — 탐색으로 간다', () => {
    exitOnboarding();

    expect(useOnboardingLandingStore.getState().pendingFirstContentId).toBeNull();
    expect(mockMarkOnboardingCompleted).toHaveBeenCalledTimes(1);
  });
});
