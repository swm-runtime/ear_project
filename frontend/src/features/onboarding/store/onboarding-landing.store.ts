import { create } from 'zustand';

/**
 * 온보딩을 막 끝낸 착지에서 **멈춘 플레이어로 열 콘텐츠**(KAN-295 — experiments-api.md 4.1).
 *
 * 온보딩 store 에 둘 수 없다 — `exitOnboarding()`이 그 store 를 통째로 초기화하므로 Main 이 읽기 전에 값이 사라진다
 * (알림 사전 안내 신호·`justCompletedOnboarding`과 같은 이유). 쓰기는 `exitOnboarding()` 한 곳이고, Main(app)이
 * 집어 한 번만 연다 — 탭된 알림의 목적지(`pendingPushTarget`)와 같은 구조다.
 *
 * 집은 뒤에는 **여는 중**(`openingContentId`)으로 남는다 — 발급을 받고 플레이어가 오를 때까지 Main 이 알림 사전 안내·가입 체험
 * 안내를 붙들 근거다(플레이어 모달과 겹치지 않게). 플레이어가 오르거나 발급이 실패하면 Main 이 비운다.
 *
 * 메모리에만 둔다 — 앱을 껐다 켜면 사라지고, 그때는 평소처럼 마지막 탭으로 들어온다(첫 편은 라이브러리에 있다).
 */
interface OnboardingLandingStore {
  /** 아직 집지 않은 열 편 */
  pendingFirstContentId: string | null;
  /** 집어서 여는 중인 편 — 플레이어가 오르거나 발급이 실패하면 null */
  openingContentId: string | null;
  setPendingFirstContentId: (contentId: string) => void;
  /** 열 편을 집는다 — 여는 중으로 옮기고 그 id 를 돌려준다. 없으면 null */
  takePendingFirstContentId: () => string | null;
  finishOpening: () => void;
  reset: () => void;
}

export const useOnboardingLandingStore = create<OnboardingLandingStore>((set, get) => ({
  pendingFirstContentId: null,
  openingContentId: null,
  setPendingFirstContentId: (contentId) => set({ pendingFirstContentId: contentId }),
  takePendingFirstContentId: () => {
    const contentId = get().pendingFirstContentId;
    if (contentId === null) return null;
    set({ pendingFirstContentId: null, openingContentId: contentId });
    return contentId;
  },
  finishOpening: () => set({ openingContentId: null }),
  reset: () => set({ pendingFirstContentId: null, openingContentId: null }),
}));
