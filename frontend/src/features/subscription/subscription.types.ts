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
export type PlanAction = 'purchase' | 'current' | 'upgrade' | 'downgrade' | 'cancel' | 'none';

export interface Plan {
  planId: string;
  /** 표시·분석용 식별자. 분기에 쓰지 않는다 */
  tier: string;
  name: string;
  description: string;
  /**
   * 이 플랫폼의 스토어 상품 ID. 무료·상품 없는 요금제는 null. 가격은 이 ID 로 스토어가 준 현지가만 그린다 —
   * 서버의 원화 참고값(`price_krw`)은 모델에 두지 않는다(KAN-196 — 두 시장 코드 경로를 하나로)
   */
  storeProductId: string | null;
  /**
   * 서버가 내린 무료 판정(`is_free`, KAN-226). 필드가 없는 서버 응답이면 null — 그때만 `isFreePlan` 이 추정한다.
   * 선택 필드라 테스트·목에서 생략해도 된다(생략 = null 과 같다)
   */
  isFree?: boolean | null;
  /**
   * 정가 취소선 표시(KAN-299 — experiments-api.md 4.4). **서버가 할인이라고 판정한(`is_discounted`) 요금제만** 정가(원)가
   * 있고, 그 밖은 null. 결제 가격은 언제나 스토어 `displayPrice` 다 — 이 값으로 할인율·가격을 계산하지 않는다.
   * 선택 필드(생략 = 할인 아님)
   */
  discountOriginalPriceKrw?: number | null;
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

/**
 * 초대(이벤트) 코드 지급(subscription-api.md 4.8 `plan.grant`) — 구독 조회·프로필·설정의 plan 에 같은 모양으로 실린다.
 * 지급은 구독이 아니다 — `status` 는 구독 상태 그대로이고, 지급 요금제가 더 높으면 서버가 tier·planName 을 지급 값으로 준다
 */
export interface PlanGrant {
  /** 코드(캠페인) 이름 — "{name} 이벤트 이용 중"에 그대로 쓴다(KAN-182) */
  name: string;
  tier: string;
  planName: string;
  endsAt: string;
  /** 지급으로 쓸 수 있는 마지막 서비스 날짜(YYYY-MM-DD) — "N월 N일까지"는 이 값 그대로(경계 보정 없음) */
  lastDate: string;
}

export interface SubscriptionPlanSummary {
  status: SubscriptionStatus;
  tier: string;
  planName: string;
  dailyPlayLimit: number | null;
  renewsAt: string | null;
  expiresAt: string | null;
  hasPaymentIssue: boolean;
  /** 지급 중이 아니면 null */
  grant: PlanGrant | null;
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
