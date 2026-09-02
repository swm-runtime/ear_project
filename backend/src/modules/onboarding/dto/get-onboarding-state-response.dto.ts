import { OnboardingStep } from '@/modules/user/user.enum';

import { YearsOfExperienceRange } from '@/modules/user/user.enum';
import { OnboardingState } from '../onboarding.types';

class OnboardingCareerDto {
  readonly job_category: string | null;
  readonly job_title: string | null;
  readonly years_of_experience: YearsOfExperienceRange | null;
}

/** onboarding-api.md 4.1 */
export class GetOnboardingStateResponseDto {
  readonly onboarding_completed: boolean;
  readonly onboarding_step: OnboardingStep;
  /**
   * 1단계에서 **서버에 저장된** 선택. 로컬 임시 저장분과 다르면 이 값이 기준이다 —
   * 로컬만 믿으면 다른 기기에서 바꾼 선택이 조용히 덮인다.
   */
  readonly selected_topic_ids: string[];
  /** 세 필드가 모두 `null`이면 건너뛴 사용자다 */
  readonly career: OnboardingCareerDto;
  /** 재진입 시 [담기]/[건너뛰기] 버튼 분기에 쓴다 */
  readonly picked_count: number;

  static from(state: OnboardingState): GetOnboardingStateResponseDto {
    return {
      onboarding_completed: state.onboardingCompleted,
      onboarding_step: state.onboardingStep,
      selected_topic_ids: state.selectedTopicIds,
      career: {
        job_category: state.career.jobCategory,
        job_title: state.career.jobTitle,
        years_of_experience: state.career.yearsOfExperience,
      },
      picked_count: state.pickedCount,
    };
  }
}
