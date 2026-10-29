import { UserTier } from '@/modules/user/user.enum';

import {
  PlanDiscountConfig,
  planDiscountConfigOf,
  resolvePlanDiscount,
} from './plan-discount.policy';

const DAILY = { tier: UserTier.DAILY, priceKrw: 1900, isFree: false };
const PRO = { tier: UserTier.PRO, priceKrw: 3900, isFree: false };
const LIGHT = { tier: UserTier.LIGHT, priceKrw: 0, isFree: true };

const ON: PlanDiscountConfig = {
  enabled: true,
  originalPriceKrw: { [UserTier.DAILY]: 3900, [UserTier.PRO]: 9900 },
};

describe('resolvePlanDiscount — 요금제 할인 표시(KAN-286)', () => {
  it('스위치가 켜져 있고 정가가 지금 가격보다 크면 할인이고 정가를 준다', () => {
    expect(resolvePlanDiscount(DAILY, ON)).toEqual({
      originalPriceKrw: 3900,
      isDiscounted: true,
    });
    expect(resolvePlanDiscount(PRO, ON)).toEqual({
      originalPriceKrw: 9900,
      isDiscounted: true,
    });
  });

  it('스위치가 꺼져 있으면 정가가 설정돼 있어도 할인이 아니다', () => {
    expect(resolvePlanDiscount(DAILY, { ...ON, enabled: false })).toEqual({
      originalPriceKrw: null,
      isDiscounted: false,
    });
  });

  it('그 티어에 정가가 없으면 할인이 아니다 — 다른 티어는 그대로 할인이다', () => {
    const onlyPro: PlanDiscountConfig = {
      enabled: true,
      originalPriceKrw: { [UserTier.PRO]: 9900 },
    };

    expect(resolvePlanDiscount(DAILY, onlyPro).isDiscounted).toBe(false);
    expect(resolvePlanDiscount(DAILY, onlyPro).originalPriceKrw).toBeNull();
    expect(resolvePlanDiscount(PRO, onlyPro).isDiscounted).toBe(true);
  });

  it('정가가 지금 가격 이하이면 할인이라고 말하지 않는다', () => {
    const same: PlanDiscountConfig = {
      enabled: true,
      originalPriceKrw: { [UserTier.DAILY]: 1900, [UserTier.PRO]: 2900 },
    };

    expect(resolvePlanDiscount(DAILY, same)).toEqual({
      originalPriceKrw: null,
      isDiscounted: false,
    });
    expect(resolvePlanDiscount(PRO, same)).toEqual({
      originalPriceKrw: null,
      isDiscounted: false,
    });
  });

  it('무료 요금제는 언제나 할인이 아니다 — 정가가 잘못 걸려 있어도', () => {
    const lightOriginal: PlanDiscountConfig = {
      enabled: true,
      originalPriceKrw: { [UserTier.LIGHT]: 1000 },
    };

    expect(resolvePlanDiscount(LIGHT, lightOriginal)).toEqual({
      originalPriceKrw: null,
      isDiscounted: false,
    });
  });
});

describe('planDiscountConfigOf — env 해석', () => {
  const read = (env: Record<string, string>) => (key: string) => env[key];

  it('스위치는 정확히 true 일 때만 켜진다', () => {
    expect(
      planDiscountConfigOf(read({ PLAN_DISCOUNT_DISPLAY_ENABLED: 'true' }))
        .enabled,
    ).toBe(true);
    for (const value of ['', 'false', 'TRUE', '1']) {
      expect(
        planDiscountConfigOf(read({ PLAN_DISCOUNT_DISPLAY_ENABLED: value }))
          .enabled,
      ).toBe(false);
    }
    expect(planDiscountConfigOf(read({})).enabled).toBe(false);
  });

  it('정가는 양의 정수만 받고, 빈 값은 정가 없음이다', () => {
    expect(
      planDiscountConfigOf(
        read({
          PLAN_DISCOUNT_ORIGINAL_PRICE_DAILY_KRW: '3900',
          PLAN_DISCOUNT_ORIGINAL_PRICE_PRO_KRW: '',
        }),
      ).originalPriceKrw,
    ).toEqual({ [UserTier.DAILY]: 3900 });
    expect(
      planDiscountConfigOf(
        read({
          PLAN_DISCOUNT_ORIGINAL_PRICE_DAILY_KRW: '0',
          PLAN_DISCOUNT_ORIGINAL_PRICE_PRO_KRW: '9900',
        }),
      ).originalPriceKrw,
    ).toEqual({ [UserTier.PRO]: 9900 });
  });
});
