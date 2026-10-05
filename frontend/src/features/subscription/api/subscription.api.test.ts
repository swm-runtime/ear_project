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
  it('4.1 요금제 목록은 platform 을 실어 조회하고 action·상품 ID·이메일 인증 여부를 그대로 옮긴다', async () => {
    // given
    const dto: PlansResponseDto = {
      plans: [
        {
          plan_id: 'uuid-pro',
          tier: 'pro',
          name: '프로',
          description: '…',
          price_krw: 9900,
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
          priceKrw: 9900,
          storeProductId: 'com.runtime.ear.subscription.pro.monthly',
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
