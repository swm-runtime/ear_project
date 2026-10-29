import type { StoreProduct } from '../services/iap-adapter';
import type { Plan } from '../subscription.types';

/** 서버 정가(`original_price_krw`)의 통화 — 스토어 가격이 이 통화일 때만 취소선을 긋는다(KAN-299) */
const KRW = 'KRW';

/** 요금제 카드 VM — 가격 문자열은 스토어가 준 현지 표기다 */
export interface PlanCardVM {
  plan: Plan;
  /**
   * 표시 가격. 무료 요금제는 "무료", 유료는 스토어 현지 가격(`₩3,900` 등).
   * 이 플랫폼에 상품이 없는 유료 요금제(action none)는 null — 가격을 지어내지 않는다
   */
  priceLabel: string | null;
  /**
   * 취소선으로 그릴 정가(원) — 서버가 할인이라고 판정했고(`is_discounted`, experiments-api.md 4.4) **스토어 가격도 원화일 때만**
   * 값이 있다(KAN-299). 서버 정가는 원화라 다른 통화 가격 옆에 그으면 뜻이 맞지 않는다. 그 밖·생략은 할인 표시 없음.
   * 결제 가격은 언제나 `priceLabel`(스토어) 이다 — 이 값으로 할인율을 계산하지 않는다
   */
  originalPriceKrw?: number | null;
}

/**
 * 무료 요금제인가 — **서버 필드로만 정한다**(KAN-196. 원화 참고값 `price_krw` 는 GLOBAL 에서 null 이라 쓰지 않는다).
 *
 * 1. 서버가 `is_free` 를 보내면 **그 값이 답이다**(subscription-api.md 4.1, 2026-10-18 KAN-226). 다른 스토어 구독자(모든 행이
 *    `action: none`)의 Light 카드에도 "무료"가 붙는다.
 * 2. 필드가 없는 서버(배포 전)면 추정한다 — 무료 요금제는 상품 ID 가 없고(`store_product_id: null`), `action` 은
 *    `current`(구독 없음)·`cancel`(유료 구독자)·`none`(다른 스토어 구독자) 중 하나다. 그런데 `none` + 상품 ID 없음은
 *    **이 플랫폼에 상품이 없는 유료 요금제**와 구별되지 않는다 — 유료를 "무료"로 그리는 쪽이 더 나쁘므로 그 경우는
 *    무료로 보지 않는다(가격 칸 비움).
 *
 * 티어명(`light`)으로 고르지 않는다(architecture.md 5.6)
 */
export const isFreePlan = (plan: Plan): boolean => {
  if (typeof plan.isFree === 'boolean') return plan.isFree;
  return plan.storeProductId === null && (plan.action === 'current' || plan.action === 'cancel');
};

/**
 * 서버 요금제 + 스토어 상품 → 카드. **상품 ID 가 있는데 스토어가 그 상품을 돌려주지 않으면 null**(전체 실패)이다 —
 * 일부만 가격 없이 그리거나 서버 원화 값으로 메우면 스토어 정책상 잘못된 가격을 보일 수 있다(subscription-api.md 4.1).
 * KR·GLOBAL 이 같은 경로다 — 가격 문자열은 언제나 스토어 `displayPrice` 다(global-api.md 4.6). 할인 표시(정가 취소선)는
 * 서버 판정을 옮기기만 하고, 원화가 아닌 스토어 가격 옆에는 긋지 않는다(KAN-299)
 */
export const mergePlanPrices = (
  plans: Plan[],
  products: StoreProduct[],
  freeLabel: string,
): PlanCardVM[] | null => {
  const productById = new Map(products.map((product) => [product.productId, product]));
  const cards: PlanCardVM[] = [];
  for (const plan of plans) {
    if (plan.storeProductId === null) {
      cards.push({ plan, priceLabel: isFreePlan(plan) ? freeLabel : null, originalPriceKrw: null });
      continue;
    }
    const product = productById.get(plan.storeProductId);
    if (product === undefined) return null;
    const original = plan.discountOriginalPriceKrw ?? null;
    cards.push({
      plan,
      priceLabel: product.displayPrice,
      originalPriceKrw: original !== null && product.currency === KRW ? original : null,
    });
  }
  return cards;
};
