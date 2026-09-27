import { create } from 'zustand';

interface LimitNoticeStore {
  isVisible: boolean;
  /** 서버가 준 안내 문구(있으면) — 없으면 확정 카피 */
  message: string | null;
  show: (message?: string | null) => void;
  hide: () => void;
}

/**
 * 한도 안내 시트(LimitNoticeSheet)의 열림 상태 — 앱 루트에 하나만 있고 어디서든 연다(토스트와 같은 방식).
 * 재생 게이트·플레이어가 "오늘 한도 소진"을 받으면 연다(PM 2026-09-28 00:11 — 토스트 대신 시트)
 */
export const useLimitNoticeStore = create<LimitNoticeStore>((set) => ({
  isVisible: false,
  message: null,
  show: (message) => set({ isVisible: true, message: message ?? null }),
  hide: () => set({ isVisible: false }),
}));
