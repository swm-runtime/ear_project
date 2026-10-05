import type { useAppUpdateStore } from '@/features/app-update';
import type { useSessionStore } from '@/features/auth';
import type { ShareLinkGate } from '@/features/share';

/** 루트 스택에 그릴 화면 하나 — 조건 렌더링이라 언제나 하나뿐이다(architecture.md 6.3) */
export type RootRoute = 'ForceUpdate' | 'Splash' | 'Auth' | 'Reconsent' | 'Main' | 'Onboarding';

export interface RootRouteInput {
  versionGate: ReturnType<typeof useAppUpdateStore.getState>['gate'];
  sessionStatus: ReturnType<typeof useSessionStore.getState>['status'];
  hasPendingConsents: boolean;
  isOnboardingCompleted: boolean;
  /** 로고 모션이 끝났는가(splash.md 4-6 최소 노출) */
  isMotionDone: boolean;
  /** 마지막 탭을 다 읽었는가(splash.md 4-1) */
  isTabPrimed: boolean;
}

/**
 * 실행 관문(splash.md 4)의 화면 분기 — RootNavigator 와 공유 링크 게이트가 **같은 판정**을 보도록
 * 한 곳에 둔다. 순서가 곧 관문 순서다: 버전(1) → 판정 중이면 스플래시 → 인증(2) → 재동의(3) → 온보딩(4).
 */
export const selectRootRoute = (input: RootRouteInput): RootRoute => {
  // 닫기 불가 — 30분 복귀 재검사에서 걸려도 여기로 온다(splash.md 2장)
  if (input.versionGate === 'required') return 'ForceUpdate';
  // 판정 전이거나·로고 모션 전이거나·마지막 탭을 아직 못 읽었으면 스플래시를 유지한다
  if (
    input.versionGate === 'pending' ||
    input.sessionStatus === 'restoring' ||
    !input.isMotionDone ||
    !input.isTabPrimed
  ) {
    return 'Splash';
  }
  if (input.sessionStatus !== 'authenticated') return 'Auth';
  if (input.hasPendingConsents) return 'Reconsent';
  return input.isOnboardingCompleted ? 'Main' : 'Onboarding';
};

/**
 * 공유 링크가 보는 관문 상태(share.md 4.3) — 스플래시면 판정 중, Main 이면 통과, 그 밖은 전부 걸린 것이다.
 * 강제 업데이트도 걸린 것이다 — 그 화면에서는 나갈 곳이 없다.
 */
export const toShareLinkGate = (route: RootRoute): ShareLinkGate => {
  if (route === 'Splash') return 'pending';
  return route === 'Main' ? 'open' : 'closed';
};
