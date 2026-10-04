import { ConfigService } from '@nestjs/config';

import { toServiceDate } from '@/common/utils/service-date.util';
import { resolveSignupTrialEndsAt } from '@/common/utils/signup-trial.util';
import { EnvironmentVariables } from '@/config/env.validation';

import { User } from '../entities/user.entity';

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

/**
 * 체험이 생기기 전에 가입한 계정이 **지금 앱을 열었을 때** 받을 체험 종료 시각 — 대상이 아니면 `null`
 * (`subscription.md` 4.8 "기존 가입자").
 *
 * 체험은 가입 때만 주는데, 그러면 기능을 켜는 날 이미 가입해 있던 사람은 영영 못 받는다. 그 사람들에게
 * **한 번** 같은 기간을 준다. 기산점은 가입일이 아니라 **앱을 연 날**이다 — 켜는 날 전원에게 같은
 * 종료일을 적으면 그 주에 앱을 열지 않은 사람은 안내도 못 보고 기간이 지나간다.
 *
 * 대상은 세 조건을 모두 만족하는 계정이다.
 * - 가입 체험 스위치가 켜져 있다 — 꺼지면 이쪽 지급도 멈춘다(스위치 하나로 전부 멈춘다)
 * - `SIGNUP_TRIAL_EXISTING_USERS_BEFORE`(서비스 날짜)보다 **먼저** 가입했다. 값이 없으면 대상이 없다.
 *   경계를 날짜로 두는 이유: 스위치를 껐다 다시 켜는 사이에 가입한 사람까지 "기존 가입자"로 쓸려 들어가지
 *   않게 한다 — 이 지급은 도입 시점의 한 번이지 상시 규칙이 아니다
 * - 체험을 받은 적이 없다(`trial_ends_at`이 비어 있다). 끝난 체험도 "받은 적 있음"이라 다시 주지 않는다
 */
export function resolveExistingUserTrialEndsAtFor(
  configService: ConfigService<EnvironmentVariables, true>,
  user: Pick<User, 'trialEndsAt' | 'createdAt'>,
  now: Date,
): Date | null {
  if (user.trialEndsAt !== null) {
    return null;
  }

  const before = configService.get('SIGNUP_TRIAL_EXISTING_USERS_BEFORE', {
    infer: true,
  });

  if (!before || toServiceDate(user.createdAt) >= before) {
    return null;
  }

  return resolveSignupTrialEndsAtFor(configService, now);
}
