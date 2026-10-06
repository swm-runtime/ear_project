/**
 * dev mock — 서버 없이 화면을 띄울 때만 쓴다(IS_SUBSCRIPTION_API_MOCKED). 판정을 흉내 내지 않고
 * 계약 모양만 맞춘다. 결제 자체는 스토어 SDK 가 있어야 하므로 mock 으로 흉내 낼 수 없다.
 */
import type {
  MySubscriptionResponseDto,
  PlansResponseDto,
  PurchaseIntentRequestDto,
  PurchaseIntentResponseDto,
  RestoreResponseDto,
} from './subscription.dto';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const FREE_SUBSCRIPTION: MySubscriptionResponseDto = {
  plan: {
    status: 'free',
    tier: 'light',
    plan_name: '라이트',
    // 한도를 2가 아닌 값으로 둔다 — 화면이 "하루 2편"을 하드코딩하면 여기서 드러난다(paywall.md 5장)
    daily_play_limit: 3,
    renews_at: null,
    expires_at: null,
    has_payment_issue: false,
  },
  entitlements: { daily_play_limit: 3, daily_drip_count: 2, drip_enabled: true, ads_enabled: true },
  store: null,
  pending_plan: null,
};

export const mockFetchPlans = async (platform: 'ios' | 'android'): Promise<PlansResponseDto> => {
  await delay(300);
  const productId = (tier: string) =>
    platform === 'ios' ? `com.runtime.ear.subscription.${tier}.monthly` : null;
  return {
    plans: [
      {
        plan_id: 'mock-light',
        tier: 'light',
        name: '라이트',
        description: '무료로 하루 3편까지 들을 수 있어요',
        price_krw: 0,
        store_product_id: null,
        entitlements: FREE_SUBSCRIPTION.entitlements,
        action: 'none',
      },
      {
        plan_id: 'mock-daily',
        tier: 'daily',
        name: '데일리',
        description: '하루 5편, 광고 없이',
        price_krw: 3900,
        store_product_id: productId('daily'),
        entitlements: {
          daily_play_limit: 5,
          daily_drip_count: 2,
          drip_enabled: true,
          ads_enabled: false,
        },
        action: platform === 'ios' ? 'purchase' : 'none',
      },
      {
        plan_id: 'mock-pro',
        tier: 'pro',
        name: '프로',
        description: '제한 없이, 광고 없이',
        price_krw: 9900,
        store_product_id: productId('pro'),
        entitlements: {
          daily_play_limit: null,
          daily_drip_count: 2,
          drip_enabled: true,
          ads_enabled: false,
        },
        action: platform === 'ios' ? 'purchase' : 'none',
      },
    ],
    is_email_verified: true,
  };
};

export const mockFetchMySubscription = async (): Promise<MySubscriptionResponseDto> => {
  await delay(300);
  return FREE_SUBSCRIPTION;
};

export const mockCreatePurchaseIntent = async (
  body: PurchaseIntentRequestDto,
): Promise<PurchaseIntentResponseDto> => {
  await delay(200);
  const id = `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
  return {
    intent_id: id,
    store_product_id: `com.runtime.ear.subscription.${body.plan_id.replace('mock-', '')}.monthly`,
    account_token: id,
  };
};

export const mockSubmitPurchase = async (): Promise<MySubscriptionResponseDto> => {
  await delay(300);
  return FREE_SUBSCRIPTION;
};

export const mockRestore = async (): Promise<RestoreResponseDto> => {
  await delay(300);
  return { restored: false, subscription: FREE_SUBSCRIPTION };
};
