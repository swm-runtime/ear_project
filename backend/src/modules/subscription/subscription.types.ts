import { UserTier } from '@/modules/user/user.enum';

import {
  PlanStatus,
  SubscriptionEnvironment,
  SubscriptionStatus,
  SubscriptionStore,
} from './subscription.enum';

/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

/**
 * `paywall.md` 4.1이 판정에 쓰는 티어 정책. **티어명을 코드에 하드코딩하지 않기 위해**
 * 판정에 필요한 두 값만 `plans`에서 읽어 넘긴다.
 */
export interface PlayLimitPolicy {
  /** `plans.daily_play_limit`. **null이면 무제한이라 판정 자체가 없다** */
  dailyPlayLimit: number | null;
  /**
   * 한도를 소진했을 때 **페이월 대신 한도 안내만** 띄워야 하는 티어인가.
   * 더 올라갈 티어가 없어 팔 것이 없는 경우다(합의 2026-08-06).
   */
  isTopTier: boolean;
}

/**
 * 플랜 카드에 그릴 값(`profile-api.md` 4.1 · `settings-api.md` 4.1).
 *
 * **두 화면이 같은 조립 함수를 쓴다**(`settings-api.md` 4.1) — 각자 조립하면 프로필과 설정의
 * 구독 표시가 어긋난다.
 */
export interface PlanView {
  status: PlanStatus;
  tier: UserTier;
  planName: string;
  /** `null`은 무제한 티어. 무료 카드의 "하루 N편" 문구를 조립하는 값이다 */
  dailyPlayLimit: number | null;
  /** 자동 갱신 중일 때의 다음 결제일. 그 외에는 `null` */
  renewsAt: Date | null;
  /** 해지 예약·유예일 때의 이용 종료일. 그 외에는 `null` */
  expiresAt: Date | null;
  hasPaymentIssue: boolean;
}

/**
 * 기능 분기의 유일한 근거(`subscription-api.md` 2장). `plans`에서 매번 조립하고 저장하지 않는다 —
 * 클라이언트는 티어명이 아니라 이 값으로 분기한다.
 */
export interface Entitlements {
  /** `null` = 무제한 */
  dailyPlayLimit: number | null;
  dailyDripCount: number;
  dripEnabled: boolean;
  adsEnabled: boolean;
}

/**
 * 스토어가 서명한 거래에서 읽은 값. **스토어 용어를 그대로 옮기지 않고 우리 의미로 환산한 것이다** —
 * 이 타입 아래로는 App Store·Play의 필드명이 내려오지 않는다(domain.md 8.2).
 */
export interface StoreTransaction {
  store: SubscriptionStore;
  environment: SubscriptionEnvironment;
  /** 한 스토어 구독의 자연 키. 갱신·업그레이드·재구독에도 같다 */
  originalTransactionId: string;
  productId: string;
  originalPurchasedAt: Date;
  /** 이 거래(결제 주기)가 시작된 시각 */
  purchasedAt: Date;
  expiresAt: Date;
  /** 환불·철회 시각. 있으면 그 거래는 즉시 무효다 */
  revokedAt: Date | null;
  /** 결제에 실어 보낸 계정 결속 토큰(= `purchase_intents.id`). 복원·스토어 밖 구매에는 없다 */
  accountToken: string | null;
  /** `latest_receipt`에 둘 원문(iOS JWS · Android 구매 토큰). 로그에 남기지 않는다 */
  receipt: string;
}

/** 스토어가 알려 준 "다음 갱신" 정보 */
export interface StoreRenewalInfo {
  isAutoRenew: boolean;
  /** 다음 갱신 때 결제될 상품 — 현재 상품과 다르면 변경 예약이다 */
  autoRenewProductId: string | null;
  /** 결제 실패 유예가 끝나는 시각. 유예 중이 아니면 `null` */
  gracePeriodExpiresAt: Date | null;
}

/** 정책 함수가 읽고 내놓는 구독 상태 — 엔티티에서 판정에 필요한 필드만 추린 것 */
export interface SubscriptionState {
  tier: UserTier;
  status: SubscriptionStatus;
  isAutoRenew: boolean;
  expiresAt: Date;
  cancelledAt: Date | null;
  pendingTier: UserTier | null;
}
