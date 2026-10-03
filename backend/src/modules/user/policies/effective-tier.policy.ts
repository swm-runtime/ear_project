import { isSignupTrialActive } from '@/common/utils/signup-trial.util';

import { User } from '../entities/user.entity';
import { UserTier } from '../user.enum';

/**
 * 그 시각에 사용자에게 **실제로 적용되는 티어**(`subscription.md` 4.8).
 *
 * `users.tier`는 결제가 쓰는 캐시(light · daily · pro)이고, 가입 체험은 그 위에 얹히는 기간 한정 값이다.
 * - 유료 구독 중이면 그 티어 — 체험 기간이 남아 있어도 표시는 구독이 우선한다
 *   (재생 한도는 둘 중 **더 넉넉한 쪽**을 쓴다 — `PlanService.getEffectivePlayLimitPolicy`)
 * - 무료인데 체험 기간 안이면 `trial`
 * - 그 밖은 저장된 티어 그대로
 *
 * 응답의 `tier`에 쓰는 값이다. 저장하지 않는다.
 */
export function resolveEffectiveTier(
  user: Pick<User, 'tier' | 'trialEndsAt'>,
  now: Date,
): UserTier {
  if (user.tier !== UserTier.LIGHT) {
    return user.tier;
  }

  return isSignupTrialActive(user.trialEndsAt, now)
    ? UserTier.TRIAL
    : UserTier.LIGHT;
}
