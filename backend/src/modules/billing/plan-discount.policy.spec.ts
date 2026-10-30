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
const NOW = new Date('2026-11-10T03:00:00.000Z');

describe('resolvePlanDiscount — 요금제 할인 표시(KAN-286)', () => {
  it('스위치가 켜져 있고 정가가 지금 가격보다 크면 할인이고 정가를 준다', () => {
    expect(resolvePlanDiscount(DAILY, ON, NOW)).toEqual({
      originalPriceKrw: 3900,
      isDiscounted: true,
    });
    expect(resolvePlanDiscount(PRO, ON, NOW)).toEqual({
      originalPriceKrw: 9900,
      isDiscounted: true,
    });
  });

  it('스위치가 꺼져 있으면 정가가 설정돼 있어도 할인이 아니다', () => {
    expect(resolvePlanDiscount(DAILY, { ...ON, enabled: false }, NOW)).toEqual({
      originalPriceKrw: null,
      isDiscounted: false,
    });
  });

  it('그 티어에 정가가 없으면 할인이 아니다 — 다른 티어는 그대로 할인이다', () => {
    const onlyPro: PlanDiscountConfig = {
      enabled: true,
      originalPriceKrw: { [UserTier.PRO]: 9900 },
    };

    expect(resolvePlanDiscount(DAILY, onlyPro, NOW).isDiscounted).toBe(false);
    expect(
      resolvePlanDiscount(DAILY, onlyPro, NOW).originalPriceKrw,
    ).toBeNull();
    expect(resolvePlanDiscount(PRO, onlyPro, NOW).isDiscounted).toBe(true);
  });

  it('정가가 지금 가격 이하이면 할인이라고 말하지 않는다', () => {
    const same: PlanDiscountConfig = {
      enabled: true,
      originalPriceKrw: { [UserTier.DAILY]: 1900, [UserTier.PRO]: 2900 },
    };

    expect(resolvePlanDiscount(DAILY, same, NOW)).toEqual({
      originalPriceKrw: null,
      isDiscounted: false,
    });
    expect(resolvePlanDiscount(PRO, same, NOW)).toEqual({
      originalPriceKrw: null,
      isDiscounted: false,
    });
  });

  it('무료 요금제는 언제나 할인이 아니다 — 정가가 잘못 걸려 있어도', () => {
    const lightOriginal: PlanDiscountConfig = {
      enabled: true,
      originalPriceKrw: { [UserTier.LIGHT]: 1000 },
    };

    expect(resolvePlanDiscount(LIGHT, lightOriginal, NOW)).toEqual({
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

describe('resolvePlanDiscount — 기간 한정 할인 종료 시각(PLAN_DISCOUNT_ENDS_AT, 11월 한 달)', () => {
  const ENDS = { ...ON, endsAt: new Date('2026-12-01T00:00:00+09:00') };

  it('종료 시각 전에는 할인이고, 그 시각부터는 스위치가 켜져 있어도 할인이 아니다', () => {
    expect(
      resolvePlanDiscount(DAILY, ENDS, new Date('2026-11-30T23:59:59+09:00')),
    ).toEqual({ originalPriceKrw: 3900, isDiscounted: true });
    expect(
      resolvePlanDiscount(DAILY, ENDS, new Date('2026-12-01T00:00:00+09:00')),
    ).toEqual({ originalPriceKrw: null, isDiscounted: false });
  });

  it('설정 해석 — 오프셋 있는 ISO 시각을 읽고 빈 값은 끝나는 시각 없음이다', () => {
    const read = (endsAt: string) => (key: string) =>
      ({
        PLAN_DISCOUNT_DISPLAY_ENABLED: 'true',
        PLAN_DISCOUNT_ENDS_AT: endsAt,
      })[key];

    expect(
      planDiscountConfigOf(read('2026-12-01T00:00:00+09:00')).endsAt,
    ).toEqual(new Date('2026-11-30T15:00:00.000Z'));
    expect(planDiscountConfigOf(read('')).endsAt).toBeNull();
  });
});
