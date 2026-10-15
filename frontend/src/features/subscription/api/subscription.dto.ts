/**
 * 통신 계약 DTO — spec/api/subscription-api.md 그대로(snake_case). 요청·응답 DTO를 공유하지 않는다(convention.md 5.2).
 */

export interface EntitlementsDto {
  daily_play_limit: number | null;
  daily_drip_count: number;
  drip_enabled: boolean;
  ads_enabled: boolean;
}

export interface PlanDto {
  plan_id: string;
  tier: string;
  name: string;
  description: string;
  price_krw: number;
  store_product_id: string | null;
  entitlements: EntitlementsDto;
  /** `cancel`(2026-10-08 — KAN-159): 유료 구독자의 무료 요금제. 고르면 스토어 구독 관리(해지)로 보낸다 */
  action: 'purchase' | 'current' | 'upgrade' | 'downgrade' | 'cancel' | 'none';
}

/** 4.1 GET /plans?platform= */
export interface PlansResponseDto {
  plans: PlanDto[];
  is_email_verified: boolean;
}

/** 4.8 초대 코드 지급 — 구독 조회·프로필·설정의 plan 에 같은 모양으로 실린다 */
export interface PlanGrantDto {
  name: string;
  tier: string;
  plan_name: string;
  ends_at: string;
  last_date: string;
}

export interface SubscriptionPlanSummaryDto {
  status: 'free' | 'subscribed' | 'cancel_scheduled' | 'grace';
  tier: string;
  plan_name: string;
  daily_play_limit: number | null;
  renews_at: string | null;
  expires_at: string | null;
  has_payment_issue: boolean;
  /** 지급 중이 아니면 null. 지급 배포 전 서버(2026-10-10 이전)는 필드가 없다 — 없으면 null 로 읽는다 */
  grant?: PlanGrantDto | null;
}

/** 4.2 GET /users/me/subscription — 4.4 제출·4.5 복원(subscription)도 같은 본문이다 */
export interface MySubscriptionResponseDto {
  plan: SubscriptionPlanSummaryDto;
  entitlements: EntitlementsDto;
  store: 'app_store' | 'play_store' | null;
  pending_plan: { tier: string; plan_name: string; effective_at: string } | null;
}

/** 4.3 POST /users/me/subscription/purchase-intents */
export interface PurchaseIntentRequestDto {
  plan_id: string;
  platform: 'ios' | 'android';
  entry_point?: 'paywall' | 'settings' | 'onboarding';
}

export interface PurchaseIntentResponseDto {
  intent_id: string;
  store_product_id: string;
  account_token: string;
}

/** 4.4 POST /users/me/subscription/purchases — iOS 는 StoreKit 2 서명 거래(JWS), Android 는 구매 토큰 */
export type SubmitPurchaseRequestDto =
  | { platform: 'ios'; intent_id?: string; signed_transaction: string }
  | { platform: 'android'; intent_id?: string; purchase_token: string; product_id: string };

/** 4.8-1 POST /users/me/subscription/invite-codes — 응답은 4.2 와 같은 본문(MySubscriptionResponseDto) */
export interface InviteCodeRequestDto {
  code: string;
}

/** 4.5 POST /users/me/subscription/restore — 배열은 0~10건 */
export type RestoreRequestDto =
  | { platform: 'ios'; signed_transactions: string[] }
  | { platform: 'android'; purchases: { purchase_token: string; product_id: string }[] };

export interface RestoreResponseDto {
  restored: boolean;
  subscription: MySubscriptionResponseDto;
}
