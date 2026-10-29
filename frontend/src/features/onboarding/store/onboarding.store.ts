import { create } from 'zustand';

import type { OnboardingCompleteResult } from '../onboarding.types';

/**
 * 완료 요청은 완료 대기 화면(O13)이 뜨며 나가고 결과는 O9 가 읽는다(onboarding-uiux.md 4.6).
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
  /**
   * 첫 드립이 끝났을 때 서버가 정해 준 "온보딩 직후 열 콘텐츠"(experiments-api.md 4.1 — KAN-295). 완료 대기(O13)가 적고
   * 온보딩 종료(`exitOnboarding`)가 착지 store 로 옮긴다. null 이면 탐색으로 착지한다
   */
  firstContentId: string | null;
  setSelectedTopicIds: (topicIds: string[]) => void;
  setCompletion: (status: CompletionStatus, result?: OnboardingCompleteResult | null) => void;
  setFirstContentId: (contentId: string | null) => void;
  reset: () => void;
}

const initialState = {
  selectedTopicIds: [] as string[],
  completionStatus: 'idle' as CompletionStatus,
  completionResult: null,
  firstContentId: null as string | null,
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  ...initialState,
  setSelectedTopicIds: (topicIds) => set({ selectedTopicIds: topicIds }),
  setCompletion: (status, result) =>
    set((prev) => ({
      completionStatus: status,
      completionResult: result === undefined ? prev.completionResult : result,
    })),
  setFirstContentId: (contentId) => set({ firstContentId: contentId }),
  reset: () => set(initialState),
}));
