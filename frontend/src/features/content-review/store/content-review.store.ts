import { create } from 'zustand';

import type { ContentReviewPrompt } from '../content-review.types';

/**
 * 콘텐츠 후기의 이 세션 상태(KAN-280) — 서버 판정을 복사해 두는 것이 아니라 **세션 동안 들고 있을 표시 값**이다(architecture.md 7.1).
 *
 * - `enabled` — 후기 기능 스위치(content-review-api.md 2.1). 마지막으로 받은 값으로 [후기] · "내 후기"를 그릴지 정한다.
 *   **받은 적 없거나 조회가 실패했으면 false**(안전한 기본값). 먼저 묻기 판정 · 시트 열기 · 프로모션 화면 응답이 모두 싣는다.
 * - 먼저 묻는 시트(L18)의 수명 — 추천 별점 팝업(L16)과 같은 단계다.
 *   `idle` 아직 묻지 않음 · `loading` 판정 조회 중 · `pending` show=true(띄울 차례) · `visible` 떠 있음 ·
 *   `done` 끝남(닫음 · 보냄 · 그만 보기 · show=false · 조회 실패 · 추천 별점이 먼저 떠서 건너뜀). 이 세션에는 다시 열지 않는다.
 * - `isLibraryEntered` — 먼저 묻는 시트는 라이브러리 진입 때만 띄운다. 판정 조회는 다른 화면에서 먼저 일어날 수 있다(켜짐 여부가 필요해서)
 */
export type ContentReviewPromptPhase = 'idle' | 'loading' | 'pending' | 'visible' | 'done';

interface ContentReviewSessionState {
  enabled: boolean;
  isLibraryEntered: boolean;
  promptPhase: ContentReviewPromptPhase;
  /** 띄운 시트의 내용 — 닫은 뒤에도 남겨 퇴장 모션 동안 빈 상자가 보이지 않게 한다 */
  prompt: ContentReviewPrompt | null;
  /** 먼저 묻는 시트로 보낸 후기가 발급한 프로모션의 안내(L19)가 떠 있다 — 가입 체험 안내가 이것도 기다린다 */
  isPromptIssuedVisible: boolean;
  setEnabled: (enabled: boolean) => void;
  markLibraryEntered: () => void;
  startPromptLoading: () => void;
  /** 판정이 `show=true` — 띄울 차례로 둔다 */
  holdPrompt: (prompt: ContentReviewPrompt) => void;
  /** 앞선 팝업이 없다 — 띄운다. 띄울 차례가 아니면 무시한다 */
  revealPrompt: () => void;
  finishPrompt: () => void;
  setPromptIssuedVisible: (isVisible: boolean) => void;
  /** 로그아웃 · 계정 전환 — 다음 계정은 새로 묻는다 */
  reset: () => void;
}

const INITIAL = {
  enabled: false,
  isLibraryEntered: false,
  promptPhase: 'idle' as ContentReviewPromptPhase,
  prompt: null,
  isPromptIssuedVisible: false,
};

export const useContentReviewStore = create<ContentReviewSessionState>((set, get) => ({
  ...INITIAL,
  setEnabled: (enabled) => {
    if (get().enabled !== enabled) set({ enabled });
  },
  markLibraryEntered: () => {
    if (!get().isLibraryEntered) set({ isLibraryEntered: true });
  },
  startPromptLoading: () => set({ promptPhase: 'loading', prompt: null }),
  holdPrompt: (prompt) => set({ promptPhase: 'pending', prompt }),
  revealPrompt: () => {
    if (get().promptPhase === 'pending') set({ promptPhase: 'visible' });
  },
  finishPrompt: () => set({ promptPhase: 'done' }),
  setPromptIssuedVisible: (isVisible) => set({ isPromptIssuedVisible: isVisible }),
  reset: () => set(INITIAL),
}));

/** [후기] · "내 후기"를 그리는가 — 마지막으로 받은 `enabled` */
export const selectIsContentReviewEnabled = (state: ContentReviewSessionState): boolean =>
  state.enabled;

/**
 * 먼저 묻는 시트(또는 그 뒤의 발급 안내)가 떠 있는가 — 가입 체험 안내(P11)가 이 값을 보고 뒤로 선다
 * (MainNavigator · launch-dialog-gate). 모달 둘이 겹치면 iOS 는 두 번째 모달을 띄우지 않기도 한다
 */
export const selectIsContentReviewPromptVisible = (state: ContentReviewSessionState): boolean =>
  state.promptPhase === 'visible' || state.isPromptIssuedVisible;
