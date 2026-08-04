import { create } from 'zustand';

interface ToastStore {
  message: string | null;
  show: (message: string) => void;
  hide: () => void;
}

/**
 * 전역 토스트 상태. 화면은 show만 호출하고 표시·자동 소멸은 Toast 컴포넌트가 담당한다.
 * (auth-uiux.md 5 — 되돌릴 필요 없는 결과 통지, 3초)
 */
export const useToastStore = create<ToastStore>((set) => ({
  message: null,
  show: (message) => set({ message }),
  hide: () => set({ message: null }),
}));
