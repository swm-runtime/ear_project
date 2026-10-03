import {
  PlanStatus,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';
import { TrialDto } from '@/modules/subscription/dto/trial.dto';
import { UserTier } from '@/modules/user/user.enum';

import { SubscriptionView } from '../billing.types';
import { EntitlementsDto } from './entitlements.dto';

/** `profile-api.md` 4.1의 `plan`과 **같은 모양**이다 — 조립 함수도 같은 것을 쓴다 */
class SubscriptionPlanDto {
  readonly status: PlanStatus;
  readonly tier: UserTier;
  readonly plan_name: string;
  readonly daily_play_limit: number | null;
  readonly renews_at: string | null;
  readonly expires_at: string | null;
  readonly has_payment_issue: boolean;
  /** 가입 체험 중일 때만 값이 있다 — 종료일·이후 한도(`subscription.md` 4.8). 아니면 `null` */
  readonly trial: TrialDto | null;
}

class PendingPlanDto {
  readonly tier: UserTier;
  readonly plan_name: string;
  /** 현재 결제 주기가 끝나는 시각 — 이때부터 적용된다 */
  readonly effective_at: string;
}

/** subscription-api.md 4.2 — 영수증 제출(4.4)·복원(4.5)도 같은 본문을 돌려준다 */
export class SubscriptionResponseDto {
  readonly plan: SubscriptionPlanDto;
  readonly entitlements: EntitlementsDto;
  readonly store: SubscriptionStore | null;
  readonly pending_plan: PendingPlanDto | null;

  static from(view: SubscriptionView): SubscriptionResponseDto {
    return {
      plan: {
        status: view.plan.status,
        tier: view.plan.tier,
        plan_name: view.plan.planName,
        daily_play_limit: view.plan.dailyPlayLimit,
        renews_at: view.plan.renewsAt?.toISOString() ?? null,
        expires_at: view.plan.expiresAt?.toISOString() ?? null,
        has_payment_issue: view.plan.hasPaymentIssue,
        trial: TrialDto.from(view.plan.trial),
      },
      entitlements: EntitlementsDto.from(view.entitlements),
      store: view.store,
      pending_plan:
        view.pendingPlan === null
          ? null
          : {
              tier: view.pendingPlan.tier,
              plan_name: view.pendingPlan.planName,
              effective_at: view.pendingPlan.effectiveAt.toISOString(),
            },
    };
  }
}
