import { UserTier } from '@/modules/user/user.enum';

import { PendingPlanView } from '../subscription.types';

/**
 * 다운그레이드 예약(`subscription-api.md` 4.2 · `profile-api.md` 4.1, KAN-161) — 구독 조회의 `pending_plan` 과
 * 프로필·설정의 `plan.pending_plan` 이 같은 모양으로 나간다(조립도 `buildPlanView` 하나).
 */
export class PendingPlanDto {
  readonly tier: UserTier;
  readonly plan_name: string;
  /** 지금 결제 주기가 끝나는 시각(ISO 8601 UTC) — 이때부터 적용된다 */
  readonly effective_at: string;

  static from(view: PendingPlanView | null): PendingPlanDto | null {
    return view === null
      ? null
      : {
          tier: view.tier,
          plan_name: view.planName,
          effective_at: view.effectiveAt.toISOString(),
        };
  }
}
