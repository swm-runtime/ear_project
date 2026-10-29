import { UserTier } from '@/modules/user/user.enum';

/**
 * 프로모션을 지금 쓸 수 없는 사유(`content-review-api.md` 2.2 `reason` · 4.7 판정 4 · 5). 목록의 흐린 버튼과 사용 거부가
 * **같은 판정**을 쓴다 — 화면이 쓸 수 있다고 그린 것을 서버가 다른 기준으로 막지 않게.
 */
export enum PromotionUnusableReason {
  /** Pro 구독 중 — 해지 예약 · 결제 유예 · 다운그레이드 예약 포함(권한이 살아 있는 구독이 Pro) */
  PRO_SUBSCRIBED = 'pro_subscribed',
  /** 다른 지급 이용 중(초대 코드 등) — 계정당 지급은 동시에 하나 */
  GRANT_ACTIVE = 'grant_active',
}

/**
 * 둘 다 해당하면 `pro_subscribed`(4.7 순서). 무료 · 가입 체험 중 · 데일리 구독 중은 쓸 수 있다(`content-review.md` 4.5).
 * `entitledTier` = 권한이 살아 있는 구독의 티어(`SubscriptionService.findEntitled` — 해지 예약 · 유예 포함), 없으면 `null`.
 * 다운그레이드 예약은 지금 티어가 Pro 라 여기서 Pro 구독 중이다.
 */
export function resolvePromotionUnusableReason(state: {
  entitledTier: UserTier | null;
  hasActiveGrant: boolean;
}): PromotionUnusableReason | null {
  if (state.entitledTier === UserTier.PRO) {
    return PromotionUnusableReason.PRO_SUBSCRIBED;
  }
  if (state.hasActiveGrant) {
    return PromotionUnusableReason.GRANT_ACTIVE;
  }

  return null;
}
