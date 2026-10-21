import { create } from 'zustand';

import type { DripFeedbackPrompt } from '../library.types';

/**
 * 추천 별점 팝업의 진행 상태(KAN-224) — 한 세션에 한 번만 뜬다.
 *
 * - `idle`    아직 묻지 않았다(라이브러리에 들어오지 않았다)
 * - `loading` 노출 판정(`GET …/prompt`)을 받는 중
 * - `pending` `show=true` — 띄울 차례지만 앞선 팝업(권장 업데이트·가입 체험 안내 등)이 끝나길 기다린다
 * - `visible` 떠 있다
 * - `done`    끝났다 — 보냈거나 닫았거나 그만 보기, 또는 `show=false`·조회 실패. 이 세션에는 다시 열지 않는다
 *
 * 서버 상태(판정 결과)를 복사해 두는 것이 아니라 **이 세션의 팝업 수명**이다(architecture.md 7.1) — 띄울지는 서버가 정했고,
 * 여기엔 "이번 세션에 이미 물었는가"와 퇴장 페이드 동안 붙잡아 둘 내용만 있다.
 */
export type DripFeedbackPhase = 'idle' | 'loading' | 'pending' | 'visible' | 'done';

interface DripFeedbackState {
  phase: DripFeedbackPhase;
  /** 띄운 팝업의 내용 — 닫은 뒤에도 남겨 퇴장 페이드 동안 빈 상자가 보이지 않게 한다 */
  prompt: DripFeedbackPrompt | null;
  startLoading: () => void;
  /** 판정이 `show=true` — 띄울 차례로 둔다 */
  hold: (prompt: DripFeedbackPrompt) => void;
  /** 앞선 팝업이 없다 — 띄운다. 띄울 차례가 아니면 무시한다 */
  reveal: () => void;
  finish: () => void;
  /** 로그아웃·계정 전환 — 다음 계정은 새로 묻는다 */
  reset: () => void;
}

export const useDripFeedbackStore = create<DripFeedbackState>((set, get) => ({
  phase: 'idle',
  prompt: null,
  startLoading: () => set({ phase: 'loading', prompt: null }),
  hold: (prompt) => set({ phase: 'pending', prompt }),
  reveal: () => {
    if (get().phase === 'pending') set({ phase: 'visible' });
  },
  finish: () => set({ phase: 'done' }),
  reset: () => set({ phase: 'idle', prompt: null }),
}));

/**
 * 팝업이 떠 있는가 — 가입 체험 안내(P11)가 이 값을 보고 뒤로 선다(MainNavigator · launch-dialog-gate).
 * 모달 둘이 겹치면 iOS 는 두 번째 모달을 아예 띄우지 않기도 한다
 */
export const selectIsDripFeedbackVisible = (state: DripFeedbackState): boolean =>
  state.phase === 'visible';
