import { create } from 'zustand';

import type { AuthUser, RequiredConsent } from '../auth.types';

/**
 * `restoring` 은 **앱 시작 직후의 판정 전 상태**다(splash.md 4). 이게 없으면 저장된 토큰이
 * 있어도 첫 프레임에 로그인 화면이 번쩍 보였다가 바뀐다 — 관문이 판정을 마칠 때까지
 * 스플래시를 유지하기 위해 세 번째 상태를 둔다.
 */
type SessionStatus = 'restoring' | 'unauthenticated' | 'authenticated';

interface SessionStore {
  status: SessionStatus;
  user: AuthUser | null;
  /**
   * 이번 진입이 **온보딩을 막 끝낸 직후**인가 — 첫 착지 탭을 가른다(2026-09-02).
   * 앱을 새로 켠 진입은 라이브러리, 온보딩 직후는 탐색이다.
   * 온보딩 store에 둘 수 없다 — `exitOnboarding()`이 그 store를 초기화한다.
   */
  justCompletedOnboarding: boolean;
  /**
   * 로그인 응답의 `pending_consents`(auth-api.md 4.1) — 비어 있지 않으면 실행 관문이
   * 재동의 화면(A20)을 먼저 태운다(splash.md 4 — 3단계). 로그인 직후에만 잡으면
   * 이미 로그인된 세션으로 다시 여는 경로가 새 나가므로 세션 상태로 들고 있는다.
   */
  pendingConsents: RequiredConsent[];
  setSession: (user: AuthUser, pendingConsents?: RequiredConsent[]) => void;
  clearPendingConsents: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  markJustCompletedOnboarding: () => void;
  clearSession: () => void;
}

/**
 * 세션 상태(클라이언트 전역 상태 — architecture.md 7.1).
 * 쓰기는 SessionService만 수행하고, 화면·내비게이션은 selector로 구독만 한다.
 */
export const useSessionStore = create<SessionStore>((set) => ({
  status: 'restoring',
  user: null,
  justCompletedOnboarding: false,
  pendingConsents: [],
  // 로그인 진입은 온보딩 직후가 아니다 — 재로그인으로 신호가 남아 있으면 안 된다
  setSession: (user, pendingConsents = []) =>
    set({ status: 'authenticated', user, justCompletedOnboarding: false, pendingConsents }),
  clearPendingConsents: () => set({ pendingConsents: [] }),
  updateUser: (patch) => set((prev) => (prev.user ? { user: { ...prev.user, ...patch } } : prev)),
  markJustCompletedOnboarding: () => set({ justCompletedOnboarding: true }),
  clearSession: () =>
    set({
      status: 'unauthenticated',
      user: null,
      justCompletedOnboarding: false,
      pendingConsents: [],
    }),
}));
