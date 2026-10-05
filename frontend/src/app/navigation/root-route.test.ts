import { describe, expect, it } from '@jest/globals';

import { selectRootRoute, toShareLinkGate, type RootRouteInput } from './root-route';

const RESOLVED: RootRouteInput = {
  versionGate: 'passed',
  sessionStatus: 'authenticated',
  hasPendingConsents: false,
  isOnboardingCompleted: true,
  isMotionDone: true,
  isTabPrimed: true,
};

describe('실행 관문 화면 분기(splash.md 4)', () => {
  it('관문을 전부 통과하면 Main 이다', () => {
    expect(selectRootRoute(RESOLVED)).toBe('Main');
  });

  it('강제 업데이트는 다른 어떤 판정보다 앞선다', () => {
    expect(selectRootRoute({ ...RESOLVED, versionGate: 'required', sessionStatus: 'restoring' })).toBe(
      'ForceUpdate',
    );
  });

  it.each([
    ['버전 확인 중', { versionGate: 'pending' as const }],
    ['세션 복원 중', { sessionStatus: 'restoring' as const }],
    ['로고 모션 중', { isMotionDone: false }],
    ['마지막 탭을 읽는 중', { isTabPrimed: false }],
  ])('%s이면 스플래시를 유지한다', (_label, patch) => {
    expect(selectRootRoute({ ...RESOLVED, ...patch })).toBe('Splash');
  });

  it('미로그인 → 시작 화면, 재동의 → 온보딩 순으로 가른다', () => {
    expect(selectRootRoute({ ...RESOLVED, sessionStatus: 'unauthenticated' })).toBe('Auth');
    expect(
      selectRootRoute({ ...RESOLVED, hasPendingConsents: true, isOnboardingCompleted: false }),
    ).toBe('Reconsent');
    expect(selectRootRoute({ ...RESOLVED, isOnboardingCompleted: false })).toBe('Onboarding');
  });
});

describe('공유 링크가 보는 관문 상태', () => {
  it('스플래시는 판정 중, Main 은 통과, 나머지는 걸린 것이다', () => {
    expect(toShareLinkGate('Splash')).toBe('pending');
    expect(toShareLinkGate('Main')).toBe('open');
    for (const route of ['ForceUpdate', 'Auth', 'Reconsent', 'Onboarding'] as const) {
      expect(toShareLinkGate(route)).toBe('closed');
    }
  });
});
