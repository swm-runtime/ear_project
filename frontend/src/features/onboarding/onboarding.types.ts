/** 서버 계약의 onboarding_step 값 그대로 쓴다(domain.md 3.1) */
export type OnboardingStep = 'topic' | 'career' | 'pick' | 'done';

export interface OnboardingTopic {
  topicId: string;
  name: string;
  parentCategory: string;
}

export interface OnboardingTopicList {
  items: OnboardingTopic[];
  /** 선택 상한. 클라이언트에 상수로 두지 않는다(onboarding-api.md 4.2) */
  maxSelectable: number;
  /** 기본 주제 세트 폴백 여부 — 정상 상태가 아니다(onboarding.md 7) */
  isFallback: boolean;
}

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

/** 두 번째 섹션의 모드는 title 문자열이 아니라 이 값으로 판정한다(onboarding-api.md 4.5) */
export type RecommendationSectionType = 'interest' | 'monthly_popular' | 'topic_discovery';

export interface RecommendedContent {
  contentId: string;
  title: string;
  authorName: string;
  sourceName: string;
  thumbnailUrl: string;
  durationSec: number;
  topics: { topicId: string; name: string }[];
}

export interface RecommendationSection {
  sectionType: RecommendationSectionType;
  /** 화면에 그대로 노출한다 — 서버가 내려주는 제목(onboarding-api.md 4.5) */
  title: string;
  items: RecommendedContent[];
}

export interface PickResult {
  savedContentIds: string[];
  failed: { contentId: string; errorCode: string }[];
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

export type OsPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type OnboardingStackParamList = {
  Topic: undefined;
  Career: undefined;
  Pick: undefined;
  /** 0건 담기 경로 전용(O13). 폴링 파라미터는 완료 응답(store)에서 읽는다 */
  FirstDripWaiting: undefined;
  Complete: undefined;
  NotificationPermission: undefined;
};
