import { OnboardingStep } from '@/modules/user/user.enum';

import { YearsOfExperienceRange } from '@/modules/user/user.enum';

class CareerDto {
  readonly job_category: string | null;
  readonly job_title: string | null;
  readonly years_of_experience: YearsOfExperienceRange | null;
}

/** onboarding-api.md 4.4 */
export class UpdateOnboardingCareerResponseDto {
  readonly career: CareerDto;
  readonly onboarding_step: OnboardingStep;

  static from(result: {
    jobCategory: string | null;
    jobTitle: string | null;
    yearsOfExperience: YearsOfExperienceRange | null;
    onboardingStep: OnboardingStep;
  }): UpdateOnboardingCareerResponseDto {
    return {
      career: {
        job_category: result.jobCategory,
        job_title: result.jobTitle,
        years_of_experience: result.yearsOfExperience,
      },
      onboarding_step: result.onboardingStep,
    };
  }
}
