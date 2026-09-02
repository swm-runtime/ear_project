import { FirstDripJobStatus } from '@/modules/drip/drip.enum';
import { OnboardingStep } from '@/modules/user/user.enum';

import {
  FIRST_DRIP_MAX_WAIT_SEC,
  FIRST_DRIP_POLL_INTERVAL_SEC,
} from '../onboarding.constant';
import { CompleteResult } from '../onboarding.types';

class FirstDripDto {
  readonly status: FirstDripJobStatus;
  readonly poll_interval_sec: number;
  readonly max_wait_sec: number;
}

/** onboarding-api.md 4.7 */
export class CompleteOnboardingResponseDto {
  readonly onboarding_completed: boolean;
  readonly onboarding_step: OnboardingStep;
  readonly onboarding_completed_at: string;
  /** **서버가 `library_items`에서 센 값이다.** 클라이언트가 선언하지 못한다 */
  readonly picked_count: number;
  /** `true`면 완료 화면 대신 로딩 화면을 띄우고 첫 드립 상태를 폴링한다 */
  readonly awaits_first_drip: boolean;
  readonly first_drip: FirstDripDto;

  static from(result: CompleteResult): CompleteOnboardingResponseDto {
    return {
      onboarding_completed: true,
      onboarding_step: OnboardingStep.DONE,
      onboarding_completed_at: result.onboardingCompletedAt.toISOString(),
      picked_count: result.pickedCount,
      awaits_first_drip: result.awaitsFirstDrip,
      first_drip: {
        status: result.firstDripStatus,
        // 대기 상한·폴링 간격을 클라이언트에 하드코딩시키지 않는다 (onboarding-api.md 2장)
        poll_interval_sec: FIRST_DRIP_POLL_INTERVAL_SEC,
        max_wait_sec: FIRST_DRIP_MAX_WAIT_SEC,
      },
    };
  }
}
