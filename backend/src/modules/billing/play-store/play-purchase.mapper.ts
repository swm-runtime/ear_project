import { StoreSubscriptionStatus } from '@/modules/subscription/policies/store-state.policy';
import { SubscriptionStore } from '@/modules/subscription/subscription.enum';
import {
  StoreRenewalInfo,
  StoreTransaction,
} from '@/modules/subscription/subscription.types';

import { PlayPurchase } from './play-store.gateway';

/** Play 구매 한 건을 공용 반영 경로(`BillingSyncService.applyStoreSnapshot`)의 입력으로 바꾼 것 */
export interface PlaySnapshot {
  /** `pending`은 결제 대기 — 아직 구독이 아니다(반영하지 않는다) */
  status: StoreSubscriptionStatus | 'pending';
  transaction: StoreTransaction;
  renewal: StoreRenewalInfo;
}

/**
 * Google Play의 구독 상태 → 우리 의미(`subscription-api.md` 4.7의 표). **순수 함수다.**
 *
 * Play의 단어를 그대로 옮기지 않는다(domain.md 8.2):
 * - `canceled`는 **해지 예약**이다 — 만료 전이면 유효하고(자동 갱신만 꺼짐), 만료가 지났으면 만료다
 * - `on_hold`·`paused`는 혜택이 없는 상태다 → 만료로 내린다(결제가 복구되면 다시 `active`로 온다)
 * - 환불·철회는 구독 상태로 구분되지 않는다(`expired`로 보인다) — 알림이 알려 준 경우에만 `isRevoked`로 받는다
 *
 * @param originalTransactionId 이 구매가 속한 구독 행의 키(`BillingSyncService.resolvePlayOriginalId`)
 */
export function toPlaySnapshot(
  purchase: PlayPurchase,
  originalTransactionId: string,
  now: Date,
  options: { isRevoked?: boolean } = {},
): PlaySnapshot {
  const isRevoked = options.isRevoked === true;
  const isExpiredByTime = purchase.expiresAt.getTime() <= now.getTime();

  const transaction: StoreTransaction = {
    store: SubscriptionStore.PLAY_STORE,
    environment: purchase.environment,
    originalTransactionId,
    productId: purchase.productId,
    originalPurchasedAt: purchase.startedAt,
    purchasedAt: purchase.startedAt,
    expiresAt: purchase.expiresAt,
    revokedAt: isRevoked ? now : null,
    accountToken: purchase.accountToken,
    // Play의 "영수증"은 구매 토큰이다 — 만료 보정 때 이 값으로 Google에 다시 묻는다
    receipt: purchase.purchaseToken,
    // 결제 주기 식별자 — 환불 고정(4.7)이 "같은 주문인가"를 본다
    orderId: purchase.orderId,
  };

  // 해지 예약(canceled)은 자동 갱신이 꺼진 유효 구독이다 — Google이 `autoRenewEnabled`를 주지만 상태로도 확정한다
  const isAutoRenew =
    purchase.state === 'canceled' ? false : purchase.isAutoRenew;
  const renewal: StoreRenewalInfo = {
    isAutoRenew,
    autoRenewProductId: purchase.pendingProductId ?? purchase.productId,
    // 유예 중에는 Google이 만료 시각을 유예 종료 시각으로 준다
    gracePeriodExpiresAt:
      purchase.state === 'grace' ? purchase.expiresAt : null,
  };

  return { status: resolveStatus(), transaction, renewal };

  function resolveStatus(): PlaySnapshot['status'] {
    if (isRevoked) {
      return 'revoked';
    }

    switch (purchase.state) {
      case 'pending':
        return 'pending';
      case 'active':
        return isExpiredByTime ? 'expired' : 'active';
      case 'canceled':
        return isExpiredByTime ? 'expired' : 'active';
      case 'grace':
        return 'grace';
      case 'on_hold':
      case 'paused':
        return 'billing_retry';
      case 'expired':
        return 'expired';
    }
  }
}

/** 그 상태가 지금 권한을 주는가 — 영수증 제출은 이게 아니면 오류, 복원은 무시한다 */
export function isEntitled(status: PlaySnapshot['status']): boolean {
  return status === 'active' || status === 'grace';
}
