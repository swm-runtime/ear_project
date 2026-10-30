import { PromotionKind } from '@/modules/content-review/content-review.enum';
import { UserTier } from '@/modules/user/user.enum';

import { PromotionUnusableReason } from '../promotion.policy';
import { PromotionView } from '../promotion.types';

/** `content-review-api.md` 2.2 `promotion` — S12 목록(4.6)과 후기 저장의 발급 응답(4.2)이 같은 모양이다 */
export class PromotionDto {
  readonly id: string;
  readonly kind: PromotionKind;
  readonly name: string;
  readonly tier: UserTier;
  readonly plan_name: string;
  readonly grant_days: number;
  readonly issued_at: string;
  readonly expires_at: string;
  /** "{N월 N일}까지 사용" — 앱이 05시 보정을 하지 않는다 */
  readonly last_usable_date: string;
  readonly redeemable: boolean;
  readonly reason: PromotionUnusableReason | null;
  readonly overlaps_trial: boolean;
  readonly redeem_preview: { ends_at: string; last_date: string };

  static from(view: PromotionView): PromotionDto {
    return {
      id: view.id,
      kind: view.kind,
      name: view.name,
      tier: view.tier,
      plan_name: view.planName,
      grant_days: view.grantDays,
      issued_at: view.issuedAt.toISOString(),
      expires_at: view.expiresAt.toISOString(),
      last_usable_date: view.lastUsableDate,
      redeemable: view.redeemable,
      reason: view.reason,
      overlaps_trial: view.overlapsTrial,
      redeem_preview: {
        ends_at: view.redeemPreview.endsAt.toISOString(),
        last_date: view.redeemPreview.lastDate,
      },
    };
  }
}
