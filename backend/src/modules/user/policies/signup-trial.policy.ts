import { ConfigService } from '@nestjs/config';

import { resolveSignupTrialEndsAt } from '@/common/utils/signup-trial.util';
import { EnvironmentVariables } from '@/config/env.validation';

/** 일수를 비워 두었을 때의 체험 기간 — 가입한 서비스 날짜를 포함한 7일 */
export const DEFAULT_SIGNUP_TRIAL_DAYS = 7;

/**
 * 지금 가입하는 계정이 받을 체험 종료 시각 — 스위치가 꺼져 있으면 `null`(체험 없음).
 *
 * **가입 시점에 한 번만 부른다.** 스위치·일수는 "지금 가입하는 사람"에게만 적용되고, 이미 적힌
 * `users.trial_ends_at`은 설정을 바꿔도 그대로다(`subscription.md` 4.8).
 */
export function resolveSignupTrialEndsAtFor(
  configService: ConfigService<EnvironmentVariables, true>,
  signedUpAt: Date,
): Date | null {
  if (configService.get('SIGNUP_TRIAL_ENABLED', { infer: true }) !== 'true') {
    return null;
  }

  const rawDays = configService.get('SIGNUP_TRIAL_DAYS', { infer: true });
  const days = rawDays ? Number(rawDays) : DEFAULT_SIGNUP_TRIAL_DAYS;

  return resolveSignupTrialEndsAt(signedUpAt, days);
}
