/** 서버 계약의 onboarding_step 값 그대로 쓴다(domain.md 3.1) */
export type OnboardingStep = 'topic' | 'career' | 'pick' | 'done';

// 주제 목록 타입(TopicItem·TopicList)은 interest feature가 소유한다(architecture.md 4.4 —
// onboarding → interest). 1단계 화면은 '@/features/interest'의 useTopicsQuery로 조회한다.

/** 구간 enum으로 주고받는다. 정수 연차를 받지 않는다(onboarding-api.md 4.4) */
export type YearsOfExperience = '0-1' | '2-3' | '4-6' | '7+';

export interface CareerInfo {
  jobCategory: string | null;
  jobTitle: string | null;
  yearsOfExperience: YearsOfExperience | null;
}

/** GET /onboarding/state — 재개 지점과 저장된 입력값(onboarding-api.md 4.1) */
export interface OnboardingState {
  onboardingCompleted: boolean;
  onboardingStep: OnboardingStep;
  selectedTopicIds: string[];
  career: CareerInfo;
  pickedCount: number;
}

export type FirstDripStatus = 'pending' | 'completed' | 'no_candidates' | 'queued';

export interface FirstDripState {
  status: FirstDripStatus;
  libraryItemCount: number | null;
  completedAt: string | null;
}

/** POST /onboarding/complete 응답(onboarding-api.md 4.7) */
export interface OnboardingCompleteResult {
  onboardingCompleted: boolean;
  onboardingStep: OnboardingStep;
  pickedCount: number;
  /** true면 완료 화면 대신 로딩 화면을 띄우고 first-drip을 폴링한다 */
  awaitsFirstDrip: boolean;
  firstDrip: {
    status: FirstDripStatus;
    pollIntervalSec: number;
    maxWaitSec: number;
  } | null;
}

// OsPermissionStatus의 원 정의는 notification feature로 이관됐다(architecture.md 4.4)

export type OnboardingStackParamList = {
  Topic: undefined;
  Career: undefined;
  /** 2단계 종료 뒤 완료 대기(O13) — 담기 단계를 뺀 뒤(2026-10-11) 모든 경로가 지난다. 폴링 파라미터는 완료 응답(store)에서 읽는다 */
  FirstDripWaiting: undefined;
  Complete: undefined;
};
