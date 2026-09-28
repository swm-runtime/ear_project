import { create } from 'zustand';

/**
 * 버전 관문 상태(splash.md 4.1 — 처리 1단계, KAN-99).
 * - `gate`: `pending` 판정 전(스플래시 유지) · `passed` 통과 · `required` 강제 업데이트(닫기 불가 화면, 이후 로직 없음)
 * - `isRecommendVisible`: 권장 안내(닫기 가능). 앱 수명당 한 번만 띄운다 — 30분 복귀 재검사마다 또 뜨면 잔소리다
 */
interface AppUpdateStore {
  gate: 'pending' | 'passed' | 'required';
  isRecommendVisible: boolean;
  hasShownRecommend: boolean;
  markPassed: (updateAvailable: boolean) => void;
  markRequired: () => void;
  dismissRecommend: () => void;
}

export const useAppUpdateStore = create<AppUpdateStore>((set, get) => ({
  gate: 'pending',
  isRecommendVisible: false,
  hasShownRecommend: false,
  markPassed: (updateAvailable) => {
    const shouldShow = updateAvailable && !get().hasShownRecommend;
    set({
      gate: 'passed',
      isRecommendVisible: shouldShow,
      hasShownRecommend: get().hasShownRecommend || shouldShow,
    });
  },
  // 한 번 required 면 되돌리지 않는다 — 통과는 다음 실행에서 서버가 다시 판정한다
  markRequired: () => set({ gate: 'required', isRecommendVisible: false }),
  dismissRecommend: () => set({ isRecommendVisible: false }),
}));
