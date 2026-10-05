import type { StoreProduct } from '../services/iap-adapter';
import type { Plan } from '../subscription.types';

/** 요금제 카드 VM — 가격 문자열은 스토어가 준 현지 표기다 */
export interface PlanCardVM {
  plan: Plan;
  /**
   * 표시 가격. 무료 요금제는 "무료", 유료는 스토어 현지 가격(`₩3,900` 등).
   * 이 플랫폼에 상품이 없는 유료 요금제(action none)는 null — 가격을 지어내지 않는다
   */
  priceLabel: string | null;
}

/**
 * 서버 요금제 + 스토어 상품 → 카드. **상품 ID 가 있는데 스토어가 그 상품을 돌려주지 않으면 null**(전체 실패)이다 —
 * 일부만 가격 없이 그리거나 price_krw 로 메우면 스토어 정책상 잘못된 가격을 보일 수 있다(subscription-api.md 4.1).
 */
export const mergePlanPrices = (
  plans: Plan[],
  products: StoreProduct[],
  freeLabel: string,
): PlanCardVM[] | null => {
  const priceById = new Map(products.map((product) => [product.productId, product.displayPrice]));
  const cards: PlanCardVM[] = [];
  for (const plan of plans) {
    if (plan.storeProductId === null) {
      cards.push({ plan, priceLabel: plan.priceKrw === 0 ? freeLabel : null });
      continue;
    }
    const price = priceById.get(plan.storeProductId);
    if (price === undefined) return null;
    cards.push({ plan, priceLabel: price });
  }
  return cards;
};
