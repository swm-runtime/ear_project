import { create } from 'zustand';

import type { AuthUser } from '../auth.types';

type SessionStatus = 'unauthenticated' | 'authenticated';

interface SessionStore {
  status: SessionStatus;
  user: AuthUser | null;
  setSession: (user: AuthUser) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  clearSession: () => void;
}

/**
 * 세션 상태(클라이언트 전역 상태 — architecture.md 7.1).
 * 쓰기는 SessionService만 수행하고, 화면·내비게이션은 selector로 구독만 한다.
 */
export const useSessionStore = create<SessionStore>((set) => ({
  status: 'unauthenticated',
  user: null,
  setSession: (user) => set({ status: 'authenticated', user }),
  updateUser: (patch) =>
    set((prev) => (prev.user ? { user: { ...prev.user, ...patch } } : prev)),
  clearSession: () => set({ status: 'unauthenticated', user: null }),
}));
