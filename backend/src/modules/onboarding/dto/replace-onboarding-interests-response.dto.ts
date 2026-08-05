import { OnboardingStep } from '@/modules/user/user.enum';

/** onboarding-api.md 4.3 */
export class ReplaceOnboardingInterestsResponseDto {
  readonly selected_topic_ids: string[];
  readonly onboarding_step: OnboardingStep;

  static from(result: {
    selectedTopicIds: string[];
    onboardingStep: OnboardingStep;
  }): ReplaceOnboardingInterestsResponseDto {
    return {
      selected_topic_ids: result.selectedTopicIds,
      onboarding_step: result.onboardingStep,
    };
  }
}
