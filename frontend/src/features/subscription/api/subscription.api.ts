import { apiClient } from '@/shared/api/api-client';

import { IS_SUBSCRIPTION_API_MOCKED } from '../subscription.constants';
import type {
  Entitlements,
  MySubscription,
  Plan,
  PlanCatalog,
  PurchaseEntryPoint,
  PurchaseIntent,
  PurchasePlatform,
} from '../subscription.types';
import type {
  EntitlementsDto,
  MySubscriptionResponseDto,
  PlanDto,
  PlansResponseDto,
  PurchaseIntentRequestDto,
  PurchaseIntentResponseDto,
  RestoreRequestDto,
  RestoreResponseDto,
  SubmitPurchaseRequestDto,
} from './subscription.dto';
import {
  mockCreatePurchaseIntent,
  mockFetchMySubscription,
  mockFetchPlans,
  mockRestore,
  mockSubmitPurchase,
} from './subscription.mock';

/* ── Query Key factory(convention.md 4.1) ── */

export const subscriptionKeys = {
  all: ['subscription'] as const,
  /** 요금제 목록 전체(플랫폼 무관) — 구독이 바뀌면 action 이 바뀌므로 통째로 무효화한다 */
  plansAll: () => [...subscriptionKeys.all, 'plans'] as const,
  plans: (platform: PurchasePlatform) => [...subscriptionKeys.plansAll(), platform] as const,
  me: () => [...subscriptionKeys.all, 'me'] as const,
  storeProducts: (productIds: readonly string[]) =>
    [...subscriptionKeys.all, 'store-products', productIds] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

export const toEntitlements = (dto: EntitlementsDto): Entitlements => ({
  dailyPlayLimit: dto.daily_play_limit,
  dailyDripCount: dto.daily_drip_count,
  dripEnabled: dto.drip_enabled,
  adsEnabled: dto.ads_enabled,
});

const toPlan = (dto: PlanDto): Plan => ({
  planId: dto.plan_id,
  tier: dto.tier,
  name: dto.name,
  description: dto.description,
  priceKrw: dto.price_krw,
  storeProductId: dto.store_product_id,
  entitlements: toEntitlements(dto.entitlements),
  action: dto.action,
});

export const toPlanCatalog = (dto: PlansResponseDto): PlanCatalog => ({
  plans: dto.plans.map(toPlan),
  isEmailVerified: dto.is_email_verified,
});

export const toMySubscription = (dto: MySubscriptionResponseDto): MySubscription => ({
  plan: {
    status: dto.plan.status,
    tier: dto.plan.tier,
    planName: dto.plan.plan_name,
    dailyPlayLimit: dto.plan.daily_play_limit,
    renewsAt: dto.plan.renews_at,
    expiresAt: dto.plan.expires_at,
    hasPaymentIssue: dto.plan.has_payment_issue,
  },
  entitlements: toEntitlements(dto.entitlements),
  store: dto.store,
  pendingPlan:
    dto.pending_plan === null
      ? null
      : {
          tier: dto.pending_plan.tier,
          planName: dto.pending_plan.plan_name,
          effectiveAt: dto.pending_plan.effective_at,
        },
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/** 4.1 요금제 목록 — 가격은 스토어 SDK 가 준 현지 가격을 병합해 그린다(price_krw 는 참고값) */
export const fetchPlans = async (platform: PurchasePlatform): Promise<PlanCatalog> => {
  const data = IS_SUBSCRIPTION_API_MOCKED
    ? await mockFetchPlans(platform)
    : (await apiClient.get<PlansResponseDto>('/plans', { params: { platform } })).data;
  return toPlanCatalog(data);
};

/** 4.2 현재 구독 — 앱 실행·포그라운드 복귀 시 동기화 대상. 결제 직후에는 4.4 응답이 같은 본문을 준다 */
export const fetchMySubscription = async (): Promise<MySubscription> => {
  const data = IS_SUBSCRIPTION_API_MOCKED
    ? await mockFetchMySubscription()
    : (await apiClient.get<MySubscriptionResponseDto>('/users/me/subscription')).data;
  return toMySubscription(data);
};

/**
 * 4.3 결제 의도 — 결제 시트를 열기 **직전**. 멱등키 없음(중복 생성 무해 — 3장 설계 메모).
 * 자동 재시도하지 않는다 — 결제 경로의 재시도는 서비스가 정한다(architecture.md 8.2).
 */
export const createPurchaseIntent = async (input: {
  planId: string;
  platform: PurchasePlatform;
  entryPoint: PurchaseEntryPoint;
}): Promise<PurchaseIntent> => {
  const body: PurchaseIntentRequestDto = {
    plan_id: input.planId,
    platform: input.platform,
    entry_point: input.entryPoint,
  };
  const data = IS_SUBSCRIPTION_API_MOCKED
    ? await mockCreatePurchaseIntent(body)
    : (
        await apiClient.post<PurchaseIntentResponseDto>(
          '/users/me/subscription/purchase-intents',
          body,
          { noAutoRetry: true },
        )
      ).data;
  return {
    intentId: data.intent_id,
    storeProductId: data.store_product_id,
    accountToken: data.account_token,
  };
};

/** 4.4 제출에 싣는 스토어 거래 — 플랫폼마다 모양이 다르다 */
export type SubmittedTransaction =
  | { platform: 'ios'; signedTransaction: string }
  | { platform: 'android'; purchaseToken: string; productId: string };

/**
 * 4.4 영수증 제출 — 200 이 와야 거래를 끝낸다(iOS finish). Android 의 구매 확인(acknowledge)은 서버가 한다.
 * 멱등키 없음 — 같은 거래의 재전송은 같은 상태로 수렴한다(original_transaction_id 가 자연 키).
 */
export const submitPurchase = async (input: {
  transaction: SubmittedTransaction;
  intentId: string | null;
}): Promise<MySubscription> => {
  const intent = input.intentId === null ? {} : { intent_id: input.intentId };
  const body: SubmitPurchaseRequestDto =
    input.transaction.platform === 'ios'
      ? { platform: 'ios', ...intent, signed_transaction: input.transaction.signedTransaction }
      : {
          platform: 'android',
          ...intent,
          purchase_token: input.transaction.purchaseToken,
          product_id: input.transaction.productId,
        };
  const data = IS_SUBSCRIPTION_API_MOCKED
    ? await mockSubmitPurchase()
    : (
        await apiClient.post<MySubscriptionResponseDto>('/users/me/subscription/purchases', body, {
          noAutoRetry: true,
        })
      ).data;
  return toMySubscription(data);
};

/** 4.5 구매 복원 — 스토어에 유효한 구독이 없어도 빈 배열로 요청한다(서버가 "없음"을 답한다) */
export const restorePurchases = async (input: {
  platform: PurchasePlatform;
  transactions: SubmittedTransaction[];
}): Promise<{ restored: boolean; subscription: MySubscription }> => {
  const body: RestoreRequestDto =
    input.platform === 'ios'
      ? {
          platform: 'ios',
          signed_transactions: input.transactions.flatMap((t) =>
            t.platform === 'ios' ? [t.signedTransaction] : [],
          ),
        }
      : {
          platform: 'android',
          purchases: input.transactions.flatMap((t) =>
            t.platform === 'android'
              ? [{ purchase_token: t.purchaseToken, product_id: t.productId }]
              : [],
          ),
        };
  const data = IS_SUBSCRIPTION_API_MOCKED
    ? await mockRestore()
    : (
        await apiClient.post<RestoreResponseDto>('/users/me/subscription/restore', body, {
          noAutoRetry: true,
        })
      ).data;
  return { restored: data.restored, subscription: toMySubscription(data.subscription) };
};
