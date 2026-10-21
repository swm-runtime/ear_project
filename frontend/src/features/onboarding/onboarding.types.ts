import type { MarketChangeParams } from '@/features/auth';

/** 서버 계약의 onboarding_step 값 그대로 쓴다(domain.md 3.1) */
export type OnboardingStep = 'topic' | 'career' | 'pick' | 'done';

/**
 * 사용자가 밟는 **화면** 단계(global-api.md 4.4 `steps[]`) — 재개 지점(`OnboardingStep`) 중 입력 화면이 있는 것만.
 * KR `["topic","career"]`, GLOBAL `["topic"]`. 순서·구성은 서버 배열이 정한다(services/onboarding-steps.ts)
 */
export type OnboardingScreenStep = Extract<OnboardingStep, 'topic' | 'career'>;

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
  /** 이 사용자가 밟을 화면 단계 — 서버 배열을 정리한 값(모르는 이름 제외, 누락 시 종전 `["topic","career"]`) */
  steps: OnboardingScreenStep[];
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
  /**
   * 시장 전환 뒤 재온보딩 중 직전 언어로 [되돌리기](KAN-228) — auth 의 시장 전환 화면을 이 스택에도 등록한다(app 이 등록).
   * 되돌리기도 새 시장의 동의를 다시 받는다(global-api.md 4.11 — 연령 재확인)
   */
  MarketChange: MarketChangeParams;
};
