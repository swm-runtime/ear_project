import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { FirstDripJobStatus } from '@/modules/drip/drip.enum';
import { FirstDripState } from '@/modules/drip/drip.types';
import {
  OnboardingStep,
  YearsOfExperienceRange,
} from '@/modules/user/user.enum';

import { RecommendationSectionType } from './onboarding.enum';
import { ContentLanguage } from '@/modules/content/content.enum';

/** convention.md 3.2 — Controller ↔ Orchestrator 경계 밖의 내부 타입 */

export interface OnboardingCareer {
  jobCategory: string | null;
  jobTitle: string | null;
  yearsOfExperience: YearsOfExperienceRange | null;
}

/** onboarding-api.md 4.1 — 재개 지점과 저장된 입력값 */
export interface OnboardingState {
  onboardingCompleted: boolean;
  onboardingStep: OnboardingStep;
  /** 이 사용자가 밟을 화면 단계(`global-api.md` 4.4). 클라이언트는 이 배열대로 잇는다 */
  steps: OnboardingStep[];
  selectedTopicIds: string[];
  career: OnboardingCareer;
  pickedCount: number;
}

export interface RecommendationItem {
  contentId: string;
  title: string;
  /** ai_generated는 null일 수 있다 — origin 분기 (domain.md 5.1) */
  authorName: string | null;
  sourceName: string;
  thumbnailUrl: string;
  language: ContentLanguage;
  durationSec: number;
  topics: { topicId: string; name: string }[];
}

export interface RecommendationSection {
  sectionType: RecommendationSectionType;
  title: string;
  items: RecommendationItem[];
}

/** onboarding-api.md 4.6 — 부분 실패를 표현한다 */
export interface PickResult {
  savedContentIds: string[];
  failed: { contentId: string; errorCode: ErrorCode }[];
  pickedCount: number;
}

/** onboarding-api.md 4.7 */
export interface CompleteResult {
  onboardingCompletedAt: Date;
  pickedCount: number;
  /** `true`면 클라이언트는 완료 화면 대신 로딩 화면을 띄우고 첫 드립 상태를 폴링한다 */
  awaitsFirstDrip: boolean;
  firstDripStatus: FirstDripJobStatus;
}

/** onboarding-api.md 4.8 + `experiments-api.md` 4.1 — 첫 드립 상태와 온보딩 직후 열 편 */
export interface FirstDripView extends FirstDripState {
  /** `completed`일 때만 값이 있다. 열 편의 제안이지 재생 허가가 아니다 */
  firstContentId: string | null;
}
