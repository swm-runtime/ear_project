import { create } from 'zustand';

import type { AuthUser } from '../auth.types';

type SessionStatus = 'unauthenticated' | 'authenticated';

interface SessionStore {
  status: SessionStatus;
  user: AuthUser | null;
  /**
   * 이번 진입이 **온보딩을 막 끝낸 직후**인가 — 첫 착지 탭을 가른다(2026-09-02).
   * 앱을 새로 켠 진입은 라이브러리, 온보딩 직후는 탐색이다.
   * 온보딩 store에 둘 수 없다 — `exitOnboarding()`이 그 store를 초기화한다.
   */
  justCompletedOnboarding: boolean;
  setSession: (user: AuthUser) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  markJustCompletedOnboarding: () => void;
  clearSession: () => void;
}

/**
 * 세션 상태(클라이언트 전역 상태 — architecture.md 7.1).
 * 쓰기는 SessionService만 수행하고, 화면·내비게이션은 selector로 구독만 한다.
 */
export const useSessionStore = create<SessionStore>((set) => ({
  status: 'unauthenticated',
  user: null,
  justCompletedOnboarding: false,
  // 로그인 진입은 온보딩 직후가 아니다 — 재로그인으로 신호가 남아 있으면 안 된다
  setSession: (user) => set({ status: 'authenticated', user, justCompletedOnboarding: false }),
  updateUser: (patch) => set((prev) => (prev.user ? { user: { ...prev.user, ...patch } } : prev)),
  markJustCompletedOnboarding: () => set({ justCompletedOnboarding: true }),
  clearSession: () =>
    set({ status: 'unauthenticated', user: null, justCompletedOnboarding: false }),
}));
