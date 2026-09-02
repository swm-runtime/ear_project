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

/**
 * 화면이 그려야 할 **플랜 4분기로 정규화한 값**(`profile-api.md` 4.1 · `settings-api.md` 4.1).
 *
 * `subscriptions.status` enum을 그대로 내려주지 않는 이유는 화면이 필요한 분기가 raw 상태와
 * 1:1이 아니기 때문이다 — 해지 예약은 `is_auto_renew` 조합이라, raw 값을 내려주면 그 판정이
 * 클라이언트마다 재작성된다. **판정은 서버가 한다.**
 *
 * 프로필·설정·구독 관리가 같은 4분기를 쓰므로 **값의 소유는 이 모듈**이다
 * (`subscriptions` · `plans` 소유자 — domain.md 2장).
 */
export enum PlanStatus {
  /** 유효한 구독 행 없음 — 행 자체가 없거나 `expired` · `refunded`뿐 */
  FREE = 'free',
  /** `active` + 자동 갱신 → 다음 결제일을 보여준다 */
  SUBSCRIBED = 'subscribed',
  /** 해지 예약 — 만료 전이지만 자동 갱신이 꺼졌다. `cancelled`도 여기다(domain.md 8.2) */
  CANCEL_SCHEDULED = 'cancel_scheduled',
  /** 결제 실패 유예 — 플랜명 + 경고 */
  GRACE = 'grace',
}
