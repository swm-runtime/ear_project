import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  createPurchaseIntent,
  fetchMySubscription,
  fetchPlans,
  restorePurchases,
  submitPurchase,
} from './subscription.api';
import type {
  MySubscriptionResponseDto,
  PlansResponseDto,
  PurchaseIntentResponseDto,
  RestoreResponseDto,
} from './subscription.dto';

// 실서버 경로의 계약을 본다 — 테스트 환경은 __DEV__ 라 mock 플래그를 끈다
jest.mock('../subscription.constants', () => ({
  ...jest.requireActual<object>('../subscription.constants'),
  IS_SUBSCRIPTION_API_MOCKED: false,
}));

const mockGet = jest.fn<(url: string, config?: unknown) => Promise<{ data: unknown }>>();
const mockPost =
  jest.fn<(url: string, body: unknown, config?: unknown) => Promise<{ data: unknown }>>();
jest.mock('@/shared/api/api-client', () => ({
  apiClient: {
    get: (url: string, config?: unknown) => mockGet(url, config),
    post: (url: string, body: unknown, config?: unknown) => mockPost(url, body, config),
  },
}));

const SUBSCRIPTION_DTO: MySubscriptionResponseDto = {
  plan: {
    status: 'subscribed',
    tier: 'pro',
    plan_name: '프로',
    daily_play_limit: null,
    renews_at: '2026-11-02T03:00:00Z',
    expires_at: null,
    has_payment_issue: false,
  },
  entitlements: {
    daily_play_limit: null,
    daily_drip_count: 2,
    drip_enabled: true,
    ads_enabled: false,
  },
  store: 'app_store',
  pending_plan: { tier: 'daily', plan_name: '데일리', effective_at: '2026-11-02T03:00:00Z' },
};

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('subscription.api 서버 계약(subscription-api.md)', () => {
  it('4.1 요금제 목록은 platform 을 실어 조회하고 action·상품 ID·무료 판정·이메일 인증 여부를 그대로 옮긴다', async () => {
    // given
    const dto: PlansResponseDto = {
      plans: [
        {
          plan_id: 'uuid-pro',
          tier: 'pro',
          name: '프로',
          description: '…',
          price_krw: 9900,
          is_free: false,
          store_product_id: 'com.runtime.ear.subscription.pro.monthly',
          entitlements: SUBSCRIPTION_DTO.entitlements,
          action: 'upgrade',
        },
      ],
      is_email_verified: false,
    };
    mockGet.mockResolvedValue({ data: dto });

    // when
    const catalog = await fetchPlans('ios');

    // then
    expect(mockGet).toHaveBeenCalledWith('/plans', { params: { platform: 'ios' } });
    expect(catalog).toEqual({
      plans: [
        {
          planId: 'uuid-pro',
          tier: 'pro',
          name: '프로',
          description: '…',
          storeProductId: 'com.runtime.ear.subscription.pro.monthly',
          isFree: false,
          discountOriginalPriceKrw: null,
          entitlements: {
            dailyPlayLimit: null,
            dailyDripCount: 2,
            dripEnabled: true,
            adsEnabled: false,
          },
          action: 'upgrade',
        },
      ],
      isEmailVerified: false,
    });
  });

  it('4.1 price_krw 가 null 이거나 없어도 깨지지 않고, 원화 값은 모델에 옮기지 않는다(KAN-196 · global-api.md 4.6)', async () => {
    // given — GLOBAL 요금제(null)와 필드를 뺀 다음 메이저 응답(생략)
    const base = {
      tier: 'pro',
      name: 'Pro',
      description: 'Listen without limits',
      store_product_id: 'com.runtime.ear.subscription.pro.monthly',
      entitlements: SUBSCRIPTION_DTO.entitlements,
      action: 'purchase' as const,
    };
    const dto: PlansResponseDto = {
      plans: [
        { ...base, plan_id: 'uuid-pro-null', price_krw: null },
        { ...base, plan_id: 'uuid-pro-omitted' },
      ],
      is_email_verified: true,
    };
    mockGet.mockResolvedValue({ data: dto });

    // when
    const catalog = await fetchPlans('ios');

    // then — 모양이 정확히 같다(toStrictEqual — 원화 값 키가 따라오지 않는다). is_free 도 없는 응답이라 isFree 는 null
    const expected = (planId: string) => ({
      planId,
      tier: 'pro',
      name: 'Pro',
      description: 'Listen without limits',
      storeProductId: 'com.runtime.ear.subscription.pro.monthly',
      isFree: null,
      discountOriginalPriceKrw: null,
      entitlements: {
        dailyPlayLimit: null,
        dailyDripCount: 2,
        dripEnabled: true,
        adsEnabled: false,
      },
      action: 'purchase',
    });
    expect(catalog).toStrictEqual({
      plans: [expected('uuid-pro-null'), expected('uuid-pro-omitted')],
      isEmailVerified: true,
    });
  });

  it('4.1 is_free 는 있으면 그대로, 없으면 null 로 옮긴다(KAN-226 — 배포 전 서버 호환)', async () => {
    // given
    const base = {
      tier: 'light',
      name: 'Light',
      description: '하루 2편까지 들을 수 있어요',
      store_product_id: null,
      entitlements: SUBSCRIPTION_DTO.entitlements,
      action: 'none' as const,
    };
    const dto: PlansResponseDto = {
      plans: [
        { ...base, plan_id: 'free', is_free: true },
        { ...base, plan_id: 'paid', is_free: false },
        { ...base, plan_id: 'legacy' },
      ],
      is_email_verified: true,
    };
    mockGet.mockResolvedValue({ data: dto });

    // when
    const catalog = await fetchPlans('android');

    // then
    expect(catalog.plans.map((plan) => [plan.planId, plan.isFree])).toEqual([
      ['free', true],
      ['paid', false],
      ['legacy', null],
    ]);
  });

  it('4.1 정가는 서버가 할인이라고 판정했을 때만 옮기고, false·필드 없음(옛 서버)·정가 null 은 할인 아님이다(KAN-299 · experiments-api.md 4.4)', async () => {
    // given
    const base = {
      tier: 'daily',
      name: 'Daily',
      description: '하루 5편까지 들을 수 있어요',
      price_krw: 1900,
      is_free: false,
      store_product_id: 'com.runtime.ear.subscription.daily.monthly',
      entitlements: SUBSCRIPTION_DTO.entitlements,
      action: 'purchase' as const,
    };
    const dto: PlansResponseDto = {
      plans: [
        { ...base, plan_id: 'discounted', original_price_krw: 3900, is_discounted: true },
        { ...base, plan_id: 'off', original_price_krw: null, is_discounted: false },
        { ...base, plan_id: 'legacy' },
        // 계약상 없는 조합 — 정가 없이 true 만 와도 취소선을 지어내지 않는다
        { ...base, plan_id: 'no-original', original_price_krw: null, is_discounted: true },
        // 계약상 없는 조합 — 판정이 false 면 정가가 실려도 그리지 않는다(판정은 서버)
        { ...base, plan_id: 'stray-original', original_price_krw: 3900, is_discounted: false },
      ],
      is_email_verified: true,
    };
    mockGet.mockResolvedValue({ data: dto });

    // when
    const catalog = await fetchPlans('ios');

    // then
    expect(catalog.plans.map((plan) => [plan.planId, plan.discountOriginalPriceKrw])).toEqual([
      ['discounted', 3900],
      ['off', null],
      ['legacy', null],
      ['no-original', null],
      ['stray-original', null],
    ]);
  });

  it('4.2 현재 구독의 pending_plan·store 를 옮긴다', async () => {
    // given
    mockGet.mockResolvedValue({ data: SUBSCRIPTION_DTO });

    // when
    const subscription = await fetchMySubscription();

    // then
    expect(mockGet).toHaveBeenCalledWith('/users/me/subscription', undefined);
    expect(subscription.store).toBe('app_store');
    expect(subscription.pendingPlan).toEqual({
      tier: 'daily',
      planName: '데일리',
      effectiveAt: '2026-11-02T03:00:00Z',
    });
  });

  it('4.3 결제 의도는 plan_id·platform·entry_point 를 보내고 자동 재시도하지 않는다', async () => {
    // given
    const dto: PurchaseIntentResponseDto = {
      intent_id: 'intent-uuid',
      store_product_id: 'com.runtime.ear.subscription.pro.monthly',
      account_token: 'intent-uuid',
    };
    mockPost.mockResolvedValue({ data: dto });

    // when
    const intent = await createPurchaseIntent({
      planId: 'uuid-pro',
      platform: 'ios',
      entryPoint: 'paywall',
    });

    // then
    expect(mockPost).toHaveBeenCalledWith(
      '/users/me/subscription/purchase-intents',
      { plan_id: 'uuid-pro', platform: 'ios', entry_point: 'paywall' },
      { noAutoRetry: true },
    );
    expect(intent).toEqual({
      intentId: 'intent-uuid',
      storeProductId: 'com.runtime.ear.subscription.pro.monthly',
      accountToken: 'intent-uuid',
    });
  });

  it('4.4 iOS 제출은 StoreKit 2 서명 거래(signed_transaction)와 intent_id 를 보낸다', async () => {
    // given
    mockPost.mockResolvedValue({ data: SUBSCRIPTION_DTO });

    // when
    await submitPurchase({
      transaction: { platform: 'ios', signedTransaction: 'eyJ.jws' },
      intentId: 'intent-uuid',
    });

    // then
    expect(mockPost).toHaveBeenCalledWith(
      '/users/me/subscription/purchases',
      { platform: 'ios', intent_id: 'intent-uuid', signed_transaction: 'eyJ.jws' },
      { noAutoRetry: true },
    );
  });

  it('4.4 미완료 거래 제출은 intent_id 를 싣지 않는다', async () => {
    // given
    mockPost.mockResolvedValue({ data: SUBSCRIPTION_DTO });

    // when
    await submitPurchase({
      transaction: { platform: 'ios', signedTransaction: 'eyJ.jws' },
      intentId: null,
    });

    // then
    expect(mockPost.mock.calls[0][1]).toEqual({ platform: 'ios', signed_transaction: 'eyJ.jws' });
  });

  it('4.4 Android 제출은 purchase_token·product_id 를 보낸다', async () => {
    // given
    mockPost.mockResolvedValue({ data: SUBSCRIPTION_DTO });

    // when
    await submitPurchase({
      transaction: { platform: 'android', purchaseToken: 'tok', productId: 'pro.monthly' },
      intentId: 'intent-uuid',
    });

    // then
    expect(mockPost.mock.calls[0][1]).toEqual({
      platform: 'android',
      intent_id: 'intent-uuid',
      purchase_token: 'tok',
      product_id: 'pro.monthly',
    });
  });

  it('4.5 iOS 복원은 signed_transactions 배열을, Android 는 purchases 배열을 보낸다', async () => {
    // given
    const dto: RestoreResponseDto = { restored: true, subscription: SUBSCRIPTION_DTO };
    mockPost.mockResolvedValue({ data: dto });

    // when
    const ios = await restorePurchases({
      platform: 'ios',
      transactions: [{ platform: 'ios', signedTransaction: 'a' }],
    });
    await restorePurchases({
      platform: 'android',
      transactions: [{ platform: 'android', purchaseToken: 't', productId: 'p' }],
    });

    // then
    expect(mockPost.mock.calls[0]).toEqual([
      '/users/me/subscription/restore',
      { platform: 'ios', signed_transactions: ['a'] },
      { noAutoRetry: true },
    ]);
    expect(mockPost.mock.calls[1][1]).toEqual({
      platform: 'android',
      purchases: [{ purchase_token: 't', product_id: 'p' }],
    });
    expect(ios.restored).toBe(true);
    expect(ios.subscription.plan.status).toBe('subscribed');
  });
});
