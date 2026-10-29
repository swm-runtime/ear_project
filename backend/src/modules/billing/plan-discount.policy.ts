import { UserTier } from '@/modules/user/user.enum';

/**
 * 요금제 할인 표시(KAN-286 — 단기 실험 ① 가격 인하, `experiments-api.md` 4.4).
 *
 * 스토어 가격을 실제로 내렸고(daily 3,900 → 1,900 · pro 9,900 → 3,900), 앱은 이를 **할인처럼**
 * 정가 취소선 + "지금 할인 중"으로 보여 준다. 앱은 스토어 `displayPrice`만 알고 정가를 모르므로 서버가 준다.
 * 실험을 끝낼 때 앱 배포 없이 끌 수 있게 표시 여부를 서버 스위치로 둔다. 정가는 **참고값**이고 결제 가격은
 * 언제나 스토어 가격이다.
 */
export interface PlanDiscountConfig {
  /** `PLAN_DISCOUNT_DISPLAY_ENABLED` — `true`를 명시했을 때만 켜진다 */
  enabled: boolean;
  /** 티어별 정가(원). 없으면 그 티어는 할인 표시를 하지 않는다 */
  originalPriceKrw: Partial<Record<UserTier, number>>;
}

export interface PlanDiscount {
  /** 취소선으로 그릴 정가. 할인이 아니면 `null` */
  originalPriceKrw: number | null;
  isDiscounted: boolean;
}

export const NO_DISCOUNT: Readonly<PlanDiscount> = Object.freeze({
  originalPriceKrw: null,
  isDiscounted: false,
});

/** 양의 정수 문자열만 받는다 — 빈 값·그 밖은 "정가 없음"(형식은 env 검증이 기동 때 이미 막는다) */
function parsePositiveInt(value: string | undefined): number | undefined {
  const trimmed = value?.trim() ?? '';

  return /^[1-9]\d*$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** env 값 → 설정. 키 읽기는 호출자가 넣는다(ConfigService·테스트 맵) */
export function planDiscountConfigOf(
  read: (key: string) => string | undefined,
): PlanDiscountConfig {
  const originalPriceKrw: Partial<Record<UserTier, number>> = {};
  const daily = parsePositiveInt(
    read('PLAN_DISCOUNT_ORIGINAL_PRICE_DAILY_KRW'),
  );
  const pro = parsePositiveInt(read('PLAN_DISCOUNT_ORIGINAL_PRICE_PRO_KRW'));

  if (daily !== undefined) {
    originalPriceKrw[UserTier.DAILY] = daily;
  }

  if (pro !== undefined) {
    originalPriceKrw[UserTier.PRO] = pro;
  }

  return {
    enabled: read('PLAN_DISCOUNT_DISPLAY_ENABLED')?.trim() === 'true',
    originalPriceKrw,
  };
}

/**
 * 그 요금제의 할인 표시. **스위치가 켜져 있고 · 유료이고 · 정가가 설정돼 있고 · 정가가 지금 가격보다 클 때만** 할인이다.
 * 정가가 지금 가격 이하이면(가격을 되돌렸는데 설정을 안 지운 경우) 할인이라고 말하지 않는다.
 */
export function resolvePlanDiscount(
  plan: { tier: UserTier; priceKrw: number; isFree: boolean },
  config: PlanDiscountConfig,
): PlanDiscount {
  if (!config.enabled || plan.isFree) {
    return { ...NO_DISCOUNT };
  }

  const original = config.originalPriceKrw[plan.tier];

  if (original === undefined || original <= plan.priceKrw) {
    return { ...NO_DISCOUNT };
  }

  return { originalPriceKrw: original, isDiscounted: true };
}
