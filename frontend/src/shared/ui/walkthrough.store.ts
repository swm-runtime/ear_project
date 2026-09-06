import { create } from 'zustand';

interface WalkthroughStore {
  /** 온보딩 직후 첫 착지 화면에서 코치마크를 띄워야 하는가 */
  pending: boolean;
  markPending: () => void;
  clear: () => void;
}

/**
 * 첫 사용 코치마크 신호. 온보딩 종료 시 세우고, 착지 화면(탐색)이 소비한다 —
 * 알림 사전 안내(markPrePromptPending)와 같은 "신호만 세우고 나간다" 패턴이다.
 * 표시·단계 진행은 소비하는 화면의 오버레이 컴포넌트가 소유한다.
 */
export const useWalkthroughStore = create<WalkthroughStore>((set) => ({
  pending: false,
  markPending: () => set({ pending: true }),
  clear: () => set({ pending: false }),
}));
