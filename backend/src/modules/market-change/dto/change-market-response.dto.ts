import { GetMeResponseDto } from '@/modules/user/dto/get-me-response.dto';
import { onboardingStepsFor } from '@/modules/user/policies/onboarding-steps.policy';
import { OnboardingStep } from '@/modules/user/user.enum';

import { MarketChangeResult } from '../market-change.types';

/**
 * `global-api.md` 4.11 — `user`는 `GET /users/me`의 `user`와 같은 모양이다(같은 DTO로 만든다). 앱은 세션 중에 `GET /users/me`를
 * 다시 읽지 않으므로, 이 응답의 `user`와 새 access token으로 세션을 갈아 끼우고 온보딩으로 보낸다.
 */
export class ChangeMarketResponseDto {
  readonly user: GetMeResponseDto['user'];
  /** 이미 그 시장이었으면 null — 기존 토큰을 그대로 쓴다 */
  readonly access_token: string | null;
  readonly access_token_expires_at: string | null;
  readonly onboarding: {
    readonly onboarding_completed: boolean;
    readonly onboarding_step: OnboardingStep;
    readonly steps: OnboardingStep[];
  };

  static from(result: MarketChangeResult, now: Date): ChangeMarketResponseDto {
    const { user } = result;

    return {
      // 동의는 같은 요청에서 받았으므로 남은 재동의가 없다 — `user` 모양만 빌린다
      user: GetMeResponseDto.from(user, [], now).user,
      access_token: result.accessToken,
      access_token_expires_at:
        result.accessTokenExpiresAt?.toISOString() ?? null,
      onboarding: {
        onboarding_completed: user.onboardingCompleted,
        onboarding_step: user.onboardingStep,
        steps: onboardingStepsFor(user.market),
      },
    };
  }
}
