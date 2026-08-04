/** domain.md 8.2 */
export enum SubscriptionStore {
  APP_STORE = 'app_store',
  PLAY_STORE = 'play_store',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  GRACE = 'grace',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
}

/** 만료 동의를 받아야 하는 "살아 있는" 구독 상태 (auth.md 4.3) */
export const LIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.GRACE,
];
