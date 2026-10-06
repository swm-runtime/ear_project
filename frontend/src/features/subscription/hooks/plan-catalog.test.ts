import { describe, expect, it } from '@jest/globals';

import type { Plan } from '../subscription.types';
import { mergePlanPrices } from './plan-catalog';
import { toPurchaseFeedback, toRestoreFeedback } from './purchase-feedback';
import { toSubscriptionStatusVM } from './subscription-status';
import { SUBSCRIPTION_COPY } from '../subscription.copy';

const plan = (overrides: Partial<Plan>): Plan => ({
  planId: 'p',
  tier: 'daily',
  name: '데일리',
  description: '',
  priceKrw: 3900,
  storeProductId: 'daily.monthly',
  entitlements: { dailyPlayLimit: 5, dailyDripCount: 2, dripEnabled: true, adsEnabled: false },
  action: 'purchase',
  ...overrides,
});

describe('요금제 카드 병합 — 가격은 스토어 현지 가격만', () => {
  it('유료 요금제에 스토어 가격을 붙이고 무료 요금제는 "무료"다', () => {
    // given
    const plans = [
      plan({ planId: 'light', storeProductId: null, priceKrw: 0, action: 'none' }),
      plan({}),
    ];

    // when
    const cards = mergePlanPrices(
      plans,
      [{ productId: 'daily.monthly', displayPrice: '₩3,900' }],
      '무료',
    );

    // then
    expect(cards?.map((c) => c.priceLabel)).toEqual(['무료', '₩3,900']);
  });

  it('스토어가 상품을 돌려주지 않으면 price_krw 로 메우지 않고 전체 실패(null)다', () => {
    expect(mergePlanPrices([plan({})], [], '무료')).toBeNull();
  });

  it('이 플랫폼에 상품이 없는 유료 요금제는 가격을 지어내지 않는다', () => {
    const cards = mergePlanPrices([plan({ storeProductId: null, action: 'none' })], [], '무료');
    expect(cards?.[0].priceLabel).toBeNull();
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
