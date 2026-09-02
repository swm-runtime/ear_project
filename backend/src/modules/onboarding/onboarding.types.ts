import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { FirstDripJobStatus } from '@/modules/drip/drip.enum';
import {
  OnboardingStep,
  YearsOfExperienceRange,
} from '@/modules/user/user.enum';

import { RecommendationSectionType } from './onboarding.enum';

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
