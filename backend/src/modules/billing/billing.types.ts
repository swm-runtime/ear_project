import { DevicePlatform, UserTier } from '@/modules/user/user.enum';
import {
  SubscriptionEnvironment,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';
import {
  Entitlements,
  PlanView,
  StorePurchaseDetail,
} from '@/modules/subscription/subscription.types';

import { PlanAction, PurchaseEntryPoint } from './billing.enum';

/** `GET /plans`의 요금제 한 줄(`subscription-api.md` 4.1) */
export interface PlanOffer {
  planId: string;
  tier: UserTier;
  name: string;
  description: string;
  priceKrw: number;
  /** 취소선으로 그릴 정가(참고값) — 할인 표시가 아니면 `null`(KAN-286, `PlanDiscountService`) */
  originalPriceKrw: number | null;
  /** 할인 표시를 하는가 — 서버 스위치·정가 설정으로 정한다. 결제 가격은 언제나 스토어 가격이다 */
  isDiscounted: boolean;
  /** 무료 요금제인가 — `isFreePlan`(가격 0 이하). 시장·플랫폼·구독 상태와 무관하다 */
  isFree: boolean;
  /** 요청 플랫폼의 상품 ID. 무료·그 플랫폼에 상품이 없으면 `null` */
  storeProductId: string | null;
  entitlements: Entitlements;
  action: PlanAction;
}

export interface PlanCatalog {
  plans: PlanOffer[];
  isEmailVerified: boolean;
}

/** 다운그레이드 예약 — 정의는 `subscription.types`(프로필·설정과 같은 값, KAN-161) */
import type { PendingPlanView } from '@/modules/subscription/subscription.types';

export type { PendingPlanView };

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
  /** iOS — 서명된 거래(JWS) */
  signedTransaction: string | null;
  /** Android — 구매 토큰. 서버가 이 값으로 Google에 현재 상태를 묻는다 */
  purchaseToken: string | null;
  now: Date;
}

export interface RestorePurchasesCommand {
  userId: string;
  platform: DevicePlatform;
  /** iOS — 현재 유효한 서명된 거래들 */
  signedTransactions: string[];
  /** Android — 현재 보유한 구매의 토큰들 */
  purchaseTokens: string[];
  now: Date;
}

export interface RestoreResult {
  restored: boolean;
  subscription: SubscriptionView;
}

/**
 * 결제 알림(Slack)으로 올릴 구독 상태 전이(`features/backend-monitoring.md` 3-7 — 2026-10-18).
 *
 * `BillingSyncService`가 구독 행을 **실제로 바꾼 반영**에서만 만든다 — 같은 구매를 다시 내거나(재제출·복원) 같은 알림이
 * 다시 와도 행이 이미 그 상태라 전이가 없다. 그래서 "한 결제에 한 번"이 행 잠금 위에서 보장된다.
 *
 * - `started` — 유효 구독이 새로 생겼다(행이 없었거나 `expired`·`refunded`였다 → 비종결)
 * - `refunded` — 환불·철회로 `refunded`가 됐다
 * - `cancel_scheduled` — 자동 갱신이 켜진 유효 구독이 꺼졌다(해지 예약)
 */
export type SubscriptionTransitionKind =
  'started' | 'refunded' | 'cancel_scheduled';

export interface SubscriptionTransition {
  kind: SubscriptionTransitionKind;
  /** `started`에서 끝난 행이 되살아났다(재구독). 행이 없었으면 `false` */
  isResubscribe: boolean;
  /** 시장(`users.market`)을 찾는 데만 쓴다 — **문구에 넣지 않는다** */
  userId: string;
  store: SubscriptionStore;
  environment: SubscriptionEnvironment;
  tier: UserTier;
  detail: StorePurchaseDetail | null;
}
