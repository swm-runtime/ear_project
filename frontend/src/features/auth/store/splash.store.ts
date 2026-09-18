import { create } from 'zustand';

interface SplashStore {
  /**
   * 스플래시 로고 모션이 끝났는가(splash.md 4-6 최소 노출) — 관문(RootNavigator)이 판정이 끝나도
   * 이게 true 가 될 때까지 스플래시를 유지한다. 시계가 아니라 **영상의 재생 위치**로 판정한다:
   * 영상은 기기·망에 따라 시작이 늦어질 수 있어 마운트 시각에서 세면 그리다 만 채로 잘린다
   */
  isMotionDone: boolean;
  markMotionDone: () => void;
}

export const useSplashStore = create<SplashStore>((set) => ({
  isMotionDone: false,
  markMotionDone: () => set({ isMotionDone: true }),
}));
