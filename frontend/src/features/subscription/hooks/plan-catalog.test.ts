import { describe, expect, it } from '@jest/globals';

import { toPlanCatalog } from '../api/subscription.api';
import type { PlansResponseDto } from '../api/subscription.dto';
import type { Plan } from '../subscription.types';
import { isFreePlan, mergePlanPrices } from './plan-catalog';
import { toPurchaseFeedback, toRestoreFeedback } from './purchase-feedback';
import { toSubscriptionStatusVM } from './subscription-status';
import { SUBSCRIPTION_COPY } from '../subscription.copy';

const plan = (overrides: Partial<Plan>): Plan => ({
  planId: 'p',
  tier: 'daily',
  name: '데일리',
  description: '',
  storeProductId: 'daily.monthly',
  entitlements: { dailyPlayLimit: 5, dailyDripCount: 2, dripEnabled: true, adsEnabled: false },
  action: 'purchase',
  ...overrides,
});

describe('요금제 카드 병합 — 가격은 스토어 현지 가격만', () => {
  it('유료 요금제에 스토어 가격을 붙이고 무료 요금제는 "무료"다', () => {
    // given
    const plans = [plan({ planId: 'light', storeProductId: null, action: 'current' }), plan({})];

    // when
    const cards = mergePlanPrices(
      plans,
      [{ productId: 'daily.monthly', displayPrice: '₩3,900' }],
      '무료',
    );

    // then
    expect(cards?.map((c) => c.priceLabel)).toEqual(['무료', '₩3,900']);
  });

  it('스토어가 상품을 돌려주지 않으면 서버 원화 값으로 메우지 않고 전체 실패(null)다', () => {
    expect(mergePlanPrices([plan({})], [], '무료')).toBeNull();
  });

  it('이 플랫폼에 상품이 없는 유료 요금제는 가격을 지어내지 않는다', () => {
    const cards = mergePlanPrices([plan({ storeProductId: null, action: 'none' })], [], '무료');
    expect(cards?.[0].priceLabel).toBeNull();
  });

  it('GLOBAL 요금제 응답(price_krw: null)도 오류 없이 스토어 현지가만 그린다(KAN-196)', () => {
    // given — 무료는 상품 ID 없음 + current, 유료는 원화 값 null
    const entitlements = {
      daily_play_limit: 5,
      daily_drip_count: 2,
      drip_enabled: true,
      ads_enabled: false,
    };
    const dto: PlansResponseDto = {
      plans: [
        {
          plan_id: 'g-light',
          tier: 'light',
          name: 'Light',
          description: 'Up to 2 episodes a day',
          price_krw: null,
          store_product_id: null,
          entitlements: { ...entitlements, daily_play_limit: 2, ads_enabled: true },
          action: 'current',
        },
        {
          plan_id: 'g-pro',
          tier: 'pro',
          name: 'Pro',
          description: 'Listen without limits',
          price_krw: null,
          store_product_id: 'pro.monthly',
          entitlements: { ...entitlements, daily_play_limit: null },
          action: 'purchase',
        },
      ],
      is_email_verified: true,
    };

    // when
    const cards = mergePlanPrices(
      toPlanCatalog(dto).plans,
      [{ productId: 'pro.monthly', displayPrice: '$6.99' }],
      'Free',
    );

    // then
    expect(cards?.map((card) => card.priceLabel)).toEqual(['Free', '$6.99']);
  });
});

describe('할인 표시 — 서버 판정을 옮기기만 한다(KAN-299 · experiments-api.md 4.4)', () => {
  it('서버가 할인이라고 준 요금제는 정가를 싣고, 결제 가격은 그대로 스토어 가격이다', () => {
    // given
    const plans = [
      plan({ planId: 'light', storeProductId: null, action: 'current', isFree: true }),
      plan({ discountOriginalPriceKrw: 3900 }),
    ];

    // when
    const cards = mergePlanPrices(
      plans,
      [{ productId: 'daily.monthly', displayPrice: '₩1,900', currency: 'KRW' }],
      '무료',
    );

    // then — 앱은 할인율·가격을 계산하지 않는다(정가는 서버 값, 가격은 스토어 값 그대로)
    expect(cards?.map((c) => [c.priceLabel, c.originalPriceKrw])).toEqual([
      ['무료', null],
      ['₩1,900', 3900],
    ]);
  });

  it('서버가 할인이 아니라고 하면(옛 서버 포함) 정가를 싣지 않는다 — 지금과 같은 표시', () => {
    const cards = mergePlanPrices(
      [plan({ discountOriginalPriceKrw: null }), plan({ planId: 'legacy' })],
      [{ productId: 'daily.monthly', displayPrice: '₩1,900', currency: 'KRW' }],
      '무료',
    );
    expect(cards?.map((c) => c.originalPriceKrw)).toEqual([null, null]);
  });

  it('스토어 가격이 원화가 아니거나 통화를 모르면 원화 정가 취소선을 긋지 않는다', () => {
    // given — 서버 판정은 시장 무관이라 GLOBAL 스토어 계정에도 true 가 올 수 있다
    const plans = [plan({ discountOriginalPriceKrw: 3900 })];

    // when
    const usd = mergePlanPrices(
      plans,
      [{ productId: 'daily.monthly', displayPrice: '$1.99', currency: 'USD' }],
      'Free',
    );
    const unknown = mergePlanPrices(
      plans,
      [{ productId: 'daily.monthly', displayPrice: '₩1,900' }],
      '무료',
    );

    // then
    expect(usd?.[0]).toMatchObject({ priceLabel: '$1.99', originalPriceKrw: null });
    expect(unknown?.[0]).toMatchObject({ priceLabel: '₩1,900', originalPriceKrw: null });
  });
});

describe('무료 요금제 판정 — 서버 is_free 우선(KAN-226)', () => {
  it('is_free: true 면 action none(다른 스토어 구독자)이어도 무료이고 카드에 "무료"가 붙는다', () => {
    // given — 다른 스토어 구독자: 모든 행이 none, 이 플랫폼 상품도 없다
    const light = plan({ planId: 'light', storeProductId: null, action: 'none', isFree: true });
    const pro = plan({ planId: 'pro', storeProductId: null, action: 'none', isFree: false });

    // when
    const cards = mergePlanPrices([light, pro], [], SUBSCRIPTION_COPY.plans.freePrice);

    // then — 종전 추정으로는 Light 도 null(가격 칸 비움)이었다
    expect(isFreePlan(light)).toBe(true);
    expect(cards?.map((card) => card.priceLabel)).toEqual([
      SUBSCRIPTION_COPY.plans.freePrice,
      null,
    ]);
  });

  it('is_free: false 면 상품 ID 없음 + current·cancel 이어도 무료가 아니다 — 서버 판정이 추정보다 앞선다', () => {
    expect(isFreePlan(plan({ storeProductId: null, action: 'current', isFree: false }))).toBe(
      false,
    );
    expect(isFreePlan(plan({ storeProductId: null, action: 'cancel', isFree: false }))).toBe(false);
    expect(
      mergePlanPrices(
        [plan({ storeProductId: null, action: 'current', isFree: false })],
        [],
        '무료',
      )?.[0].priceLabel,
    ).toBeNull();
  });

  it('is_free 가 없는 응답(배포 전 서버)은 toPlanCatalog 를 거쳐도 종전 추정으로 돌아간다', () => {
    // given — is_free 키가 없는 DTO
    const entitlements = {
      daily_play_limit: 2,
      daily_drip_count: 2,
      drip_enabled: true,
      ads_enabled: true,
    };
    const row = (planId: string, action: 'current' | 'none') => ({
      plan_id: planId,
      tier: 'light',
      name: 'Light',
      description: '',
      store_product_id: null,
      entitlements,
      action,
    });
    const dto: PlansResponseDto = {
      plans: [row('current', 'current'), row('none', 'none')],
      is_email_verified: true,
    };

    // when
    const cards = mergePlanPrices(toPlanCatalog(dto).plans, [], '무료');

    // then — current 는 무료, none 은 "상품 없는 유료"와 구별되지 않아 비움
    expect(cards?.map((card) => card.priceLabel)).toEqual(['무료', null]);
  });
});

describe('무료 요금제 판정 폴백 — is_free 가 없을 때 서버 필드(상품 ID·action)로 추정', () => {
  it('상품 ID 가 없고 current(구독 없음)·cancel(유료 구독자)이면 무료다', () => {
    expect(isFreePlan(plan({ storeProductId: null, action: 'current' }))).toBe(true);
    expect(isFreePlan(plan({ storeProductId: null, action: 'cancel' }))).toBe(true);
  });

  it('상품 ID 가 있으면 무료가 아니다', () => {
    expect(isFreePlan(plan({ action: 'current' }))).toBe(false);
  });

  it('상품 ID 없음 + none 은 "상품 없는 유료"와 구별되지 않아 무료로 보지 않는다', () => {
    expect(isFreePlan(plan({ storeProductId: null, action: 'none' }))).toBe(false);
  });
});

describe('결제 결과 → 화면 반응', () => {
  const subscription = {
    plan: {
      status: 'subscribed' as const,
      tier: 'pro',
      planName: '프로',
      dailyPlayLimit: null,
      renewsAt: null,
      expiresAt: null,
      hasPaymentIssue: false,
      grant: null,
    },
    entitlements: { dailyPlayLimit: null, dailyDripCount: 2, dripEnabled: true, adsEnabled: false },
    store: 'app_store' as const,
    pendingPlan: null,
  };

  it('결제 취소는 토스트도 안내도 없다', () => {
    expect(toPurchaseFeedback({ kind: 'cancelled' }, 'purchase')).toEqual({
      toast: null,
      notice: null,
      shouldRefetchPlans: false,
    });
  });

  it('구독 성공은 "구독이 시작되었어요" 토스트다', () => {
    expect(toPurchaseFeedback({ kind: 'success', subscription }, 'purchase').toast).toBe(
      SUBSCRIPTION_COPY.result.purchased,
    );
  });

  it('다운그레이드 성공은 서버 pending_plan 날짜로 적용 시점을 안내한다', () => {
    // given
    const pendingPlan = { tier: 'daily', planName: '데일리', effectiveAt: '2026-11-02T03:00:00Z' };

    // when
    const feedback = toPurchaseFeedback(
      { kind: 'success', subscription: { ...subscription, pendingPlan } },
      'downgrade',
    );

    // then
    expect(feedback.toast).toBe(
      SUBSCRIPTION_COPY.status.pendingPlan(pendingPlan.effectiveAt, '데일리'),
    );
  });

  it('요금제를 구독할 수 없으면 안내하고 요금제 목록을 다시 받는다', () => {
    const feedback = toPurchaseFeedback({ kind: 'failed', reason: 'planUnavailable' }, 'purchase');
    expect(feedback.notice).toEqual({
      message: SUBSCRIPTION_COPY.error.planUnavailable,
      tone: 'error',
    });
    expect(feedback.shouldRefetchPlans).toBe(true);
  });

  it('반영 지연은 "잠시 후 자동으로 반영됩니다" 안내다', () => {
    expect(toPurchaseFeedback({ kind: 'delayed' }, 'purchase').notice?.message).toBe(
      SUBSCRIPTION_COPY.result.delayed,
    );
  });

  it('복원 성공은 "구독이 복원되었어요", 없으면 "복원할 구독이 없어요"다', () => {
    expect(toRestoreFeedback({ kind: 'restored', subscription }).toast).toBe('구독이 복원되었어요');
    expect(toRestoreFeedback({ kind: 'nothingToRestore', subscription }).toast).toBe(
      '복원할 구독이 없어요',
    );
  });
});

describe('현재 구독 카드 — 서버 status 를 그대로 옮긴다', () => {
  const base = {
    entitlements: { dailyPlayLimit: null, dailyDripCount: 2, dripEnabled: true, adsEnabled: false },
    pendingPlan: null,
  };

  it('다른 스토어에서 결제한 구독자는 otherStore 로 표시한다', () => {
    const vm = toSubscriptionStatusVM(
      {
        ...base,
        store: 'play_store',
        plan: {
          status: 'subscribed',
          tier: 'pro',
          planName: '프로',
          dailyPlayLimit: null,
          renewsAt: null,
          expiresAt: null,
          hasPaymentIssue: false,
          grant: null,
        },
      },
      'app_store',
    );
    expect(vm).toMatchObject({ kind: 'subscribed', otherStore: 'play_store' });
  });

  it('해지 예약은 expires_at 날짜를 실어 cancelScheduled 다', () => {
    const vm = toSubscriptionStatusVM(
      {
        ...base,
        store: 'app_store',
        plan: {
          status: 'cancel_scheduled',
          tier: 'pro',
          planName: '프로',
          dailyPlayLimit: null,
          renewsAt: null,
          expiresAt: '2026-11-02T03:00:00Z',
          hasPaymentIssue: false,
          grant: null,
        },
      },
      'app_store',
    );
    expect(vm).toEqual({
      kind: 'cancelScheduled',
      planName: '프로',
      expiresAt: '2026-11-02T03:00:00Z',
      otherStore: null,
    });
  });
});
