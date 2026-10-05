/**
 * subscription feature 도메인 모델(camelCase) — DTO(snake_case)는 api/subscription.dto.ts 에 따로 둔다.
 * 계약 원본은 spec/api/subscription-api.md 다.
 */
import type { DevicePlatform } from '@/shared/lib/device-platform';

/**
 * 기능 분기의 유일한 근거(subscription-api.md 2장). **티어명으로 분기하지 않는다**(architecture.md 5.6).
 * dailyPlayLimit null = 무제한
 */
export interface Entitlements {
  dailyPlayLimit: number | null;
  dailyDripCount: number;
  dripEnabled: boolean;
  adsEnabled: boolean;
}

/**
 * 요금제 하나에 대해 이 사용자가 할 수 있는 일 — **서버가 판정한다**(subscription-api.md 4.1).
 * 클라이언트는 티어 순서를 비교하지 않는다.
 */
export type PlanAction = 'purchase' | 'current' | 'upgrade' | 'downgrade' | 'none';

export interface Plan {
  planId: string;
  /** 표시·분석용 식별자. 분기에 쓰지 않는다 */
  tier: string;
  name: string;
  description: string;
  /** 참고값 — 화면에는 스토어가 준 현지 가격을 그린다. 폴백으로도 쓰지 않는다 */
  priceKrw: number;
  /** 이 플랫폼의 스토어 상품 ID. 무료·상품 없는 요금제는 null */
  storeProductId: string | null;
  entitlements: Entitlements;
  action: PlanAction;
}

export interface PlanCatalog {
  plans: Plan[];
  isEmailVerified: boolean;
}

/** 어느 스토어에서 구독 중인가 — 해지·결제 수단 확인을 어디로 보낼지의 근거 */
export type SubscriptionStore = 'app_store' | 'play_store';

/** 구독 요약 status 4분기(profile-api.md 4.1과 같은 조립 함수) */
export type SubscriptionStatus = 'free' | 'subscribed' | 'cancel_scheduled' | 'grace';

export interface SubscriptionPlanSummary {
  status: SubscriptionStatus;
  tier: string;
  planName: string;
  dailyPlayLimit: number | null;
  renewsAt: string | null;
  expiresAt: string | null;
  hasPaymentIssue: boolean;
}

/** 다운그레이드 예약 — "N월 N일부터 데일리" 안내의 근거(subscription-api.md 4.2) */
export interface PendingPlan {
  tier: string;
  planName: string;
  effectiveAt: string;
}

/** GET /users/me/subscription · 영수증 제출·복원 응답의 같은 본문 */
export interface MySubscription {
  plan: SubscriptionPlanSummary;
  entitlements: Entitlements;
  store: SubscriptionStore | null;
  pendingPlan: PendingPlan | null;
}

export interface PurchaseIntent {
  intentId: string;
  storeProductId: string;
  /** 결제에 반드시 실어 보낸다 — iOS appAccountToken · Android obfuscatedAccountId */
  accountToken: string;
}

/** 전환 분석용 — 판정에 쓰지 않는다(subscription-api.md 4.3) */
export type PurchaseEntryPoint = 'paywall' | 'settings' | 'onboarding';

export type PurchasePlatform = DevicePlatform;
