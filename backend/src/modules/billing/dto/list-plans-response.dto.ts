import { UserTier } from '@/modules/user/user.enum';

import { PlanAction } from '../billing.enum';
import { PlanCatalog } from '../billing.types';
import { EntitlementsDto } from './entitlements.dto';

class PlanOfferDto {
  readonly plan_id: string;
  readonly tier: UserTier;
  readonly name: string;
  readonly description: string;
  /** **참고값** — 화면에는 스토어 SDK가 준 현지 가격을 그린다 */
  readonly price_krw: number;
  readonly store_product_id: string | null;
  readonly entitlements: EntitlementsDto;
  readonly action: PlanAction;
}

/** subscription-api.md 4.1 */
export class ListPlansResponseDto {
  readonly plans: PlanOfferDto[];
  readonly is_email_verified: boolean;

  static from(catalog: PlanCatalog): ListPlansResponseDto {
    return {
      plans: catalog.plans.map((plan) => ({
        plan_id: plan.planId,
        tier: plan.tier,
        name: plan.name,
        description: plan.description,
        price_krw: plan.priceKrw,
        store_product_id: plan.storeProductId,
        entitlements: EntitlementsDto.from(plan.entitlements),
        action: plan.action,
      })),
      is_email_verified: catalog.isEmailVerified,
    };
  }
}
