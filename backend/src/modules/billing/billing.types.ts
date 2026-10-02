import { DevicePlatform, UserTier } from '@/modules/user/user.enum';
import { SubscriptionStore } from '@/modules/subscription/subscription.enum';
import {
  Entitlements,
  PlanView,
} from '@/modules/subscription/subscription.types';

import { PlanAction, PurchaseEntryPoint } from './billing.enum';

/** `GET /plans`의 요금제 한 줄(`subscription-api.md` 4.1) */
export interface PlanOffer {
  planId: string;
  tier: UserTier;
  name: string;
  description: string;
  priceKrw: number;
  /** 요청 플랫폼의 상품 ID. 무료·그 플랫폼에 상품이 없으면 `null` */
  storeProductId: string | null;
  entitlements: Entitlements;
  action: PlanAction;
}

export interface PlanCatalog {
  plans: PlanOffer[];
  isEmailVerified: boolean;
}

/** 다운그레이드 예약 — "언제부터 어느 요금제"(`subscription-api.md` 4.2) */
export interface PendingPlanView {
  tier: UserTier;
  planName: string;
  effectiveAt: Date;
}

/** `GET /users/me/subscription`의 본문. 영수증 제출·복원도 같은 것을 돌려준다 */
export interface SubscriptionView {
  plan: PlanView;
  entitlements: Entitlements;
  store: SubscriptionStore | null;
  pendingPlan: PendingPlanView | null;
}

export interface CreatePurchaseIntentCommand {
  userId: string;
  planId: string;
  platform: DevicePlatform;
  /** 전환 분석용 — 판정에 쓰지 않는다 */
  entryPoint: PurchaseEntryPoint | null;
}

export interface PurchaseIntentResult {
  intentId: string;
  storeProductId: string;
}

export interface SubmitPurchaseCommand {
  userId: string;
  platform: DevicePlatform;
  /** 서명된 거래(iOS JWS). Android는 아직 받지 않는다 */
  signedTransaction: string | null;
  now: Date;
}

export interface RestorePurchasesCommand {
  userId: string;
  platform: DevicePlatform;
  signedTransactions: string[];
  now: Date;
}

export interface RestoreResult {
  restored: boolean;
  subscription: SubscriptionView;
}
