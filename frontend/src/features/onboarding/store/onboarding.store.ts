import { create } from 'zustand';

import type { OnboardingCompleteResult } from '../onboarding.types';

/**
 * 완료 요청은 3단계 종료 시점에 나가고 화면(O13·O9)은 그 뒤에 뜬다(onboarding-uiux.md 4.6).
 * 요청과 화면의 수명이 달라 mutation 훅 대신 store로 상태를 공유한다 —
 * 쓰기는 completion service만 수행하고 화면은 selector로 구독만 한다.
 */
export type CompletionStatus = 'idle' | 'pending' | 'success' | 'error';

interface OnboardingStore {
  /** 1단계 선택 상태 — [다음] 전까지는 서버에 저장하지 않는다(onboarding.md 4 [1]).
   *  TODO: MMKV 도입 시 로컬 임시 저장으로 승격한다(architecture.md 7.2 — 앱 강제 종료 복원) */
  selectedTopicIds: string[];
  completionStatus: CompletionStatus;
  completionResult: OnboardingCompleteResult | null;
  /** 재고 팝업은 온보딩 전체에서 1회만 뜬다(onboarding.md 4 [알림]).
   *  TODO: MMKV 도입 시 소진 플래그를 영속한다(architecture.md 7.2) */
  isReconsiderConsumed: boolean;
  setSelectedTopicIds: (topicIds: string[]) => void;
  setCompletion: (status: CompletionStatus, result?: OnboardingCompleteResult | null) => void;
  consumeReconsider: () => void;
  reset: () => void;
}

const initialState = {
  selectedTopicIds: [] as string[],
  completionStatus: 'idle' as CompletionStatus,
  completionResult: null,
  isReconsiderConsumed: false,
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  ...initialState,
  setSelectedTopicIds: (topicIds) => set({ selectedTopicIds: topicIds }),
  setCompletion: (status, result) =>
    set((prev) => ({
      completionStatus: status,
      completionResult: result === undefined ? prev.completionResult : result,
    })),
  consumeReconsider: () => set({ isReconsiderConsumed: true }),
  reset: () => set(initialState),
}));
