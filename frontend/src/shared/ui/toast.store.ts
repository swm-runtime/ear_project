import { create } from 'zustand';

/** 토스트에 얹는 단일 액션 — 담기 완료의 [보러가기] 같은 이동 버튼(explore-uiux.md 4.4) */
export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastStore {
  message: string | null;
  action: ToastAction | null;
  show: (message: string, action?: ToastAction) => void;
  hide: () => void;
}

/**
 * 전역 토스트 상태. 화면은 show만 호출하고 표시·자동 소멸은 Toast 컴포넌트가 담당한다.
 * (auth-uiux.md 5 — 되돌릴 필요 없는 결과 통지, 3초)
 */
export const useToastStore = create<ToastStore>((set) => ({
  message: null,
  action: null,
  show: (message, action) => set({ message, action: action ?? null }),
  hide: () => set({ message: null, action: null }),
}));
