import { UserTier } from '@/modules/user/user.enum';

import { SubscriptionStatus } from '../subscription.enum';
import {
  StoreRenewalInfo,
  StoreTransaction,
  SubscriptionState,
} from '../subscription.types';

/**
 * 스토어가 준 사실(서명된 거래·서버 알림·상태 조회)을 `subscriptions`의 상태로 환산하는 **순수 함수**들.
 *
 * DB·스토어를 모른다 — 입력은 "지금 저장된 상태"와 "스토어가 말한 것"이고 출력은 "저장할 상태"다.
 * 영수증 제출·복원·웹훅·만료 보정이 전부 이 함수들을 거쳐, 같은 사실이 어느 경로로 들어와도 같은 상태가 된다.
 *
 * **스토어 용어를 그대로 옮기지 않는다**(domain.md 8.2). Apple의 "cancel"·"revoke"·"expire"가 가리키는 사건을
 * 우리 5개 상태의 의미로 바꾼다 — 해지 예약은 `cancelled`(만료일까지 유효), 환불·철회는 `refunded`(즉시 무효).
 */

/** 권한이 끝난 상태 — 새 결제가 들어오기 전에는 되살아나지 않는다 */
const TERMINAL_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.EXPIRED,
  SubscriptionStatus.REFUNDED,
];

export function isTerminalStatus(status: SubscriptionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export type TransactionValidity = 'valid' | 'expired' | 'revoked';

/** 거래 하나가 지금 권한을 주는가 */
export function classifyTransaction(
  transaction: StoreTransaction,
  now: Date,
): TransactionValidity {
  if (transaction.revokedAt !== null) {
    return 'revoked';
  }

  return transaction.expiresAt.getTime() > now.getTime() ? 'valid' : 'expired';
}

export type StoreStateDecision =
  /** 이 상태로 저장한다 */
  | { kind: 'apply'; state: SubscriptionState }
  /** 이미 그 상태다(같은 거래의 재전송) — 쓰지 않지만 성공이다 */
  | { kind: 'unchanged' }
  /** 반영하면 안 되는 입력 — 사유는 로그·테스트용 */
  | { kind: 'ignore'; reason: StoreStateIgnoreReason };

export type StoreStateIgnoreReason =
  /** 저장된 것보다 앞선 결제 주기의 거래다 */
  | 'older_transaction'
  /** 종결된 구독을, 종결 이전에 서명된 거래로 되살리려 한다(환불 뒤 옛 영수증 재제출) */
  | 'replayed_after_termination'
  /** 마지막으로 반영한 알림보다 먼저 서명된 알림이다 */
  | 'out_of_order'
  /** 종결된 구독에 대한 갱신 설정 변경 — 되살리지 않는다 */
  | 'terminated'
  | 'no_transaction'
  /** 상품이 어느 요금제인지 모른다 */
  | 'unknown_product'
  /** 상태를 바꾸지 않는 알림 유형(TEST·PRICE_INCREASE 등) */
  | 'unhandled_type';

/** 기존 상태 + 마지막 알림 시각. 행이 없으면 `null` */
export type StoredSubscriptionState = SubscriptionState & {
  lastNotifiedAt: Date | null;
};

function freshState(
  tier: UserTier,
  transaction: StoreTransaction,
  renewal: StoreRenewalInfo | null,
  signedAt: Date,
): SubscriptionState {
  const isAutoRenew = renewal?.isAutoRenew ?? true;

  return {
    tier,
    // 자동 갱신이 꺼진 채 유효한 구독은 해지 예약이다(domain.md 8.2 — `cancelled`는 정의상 `is_auto_renew = false`)
    status: isAutoRenew
      ? SubscriptionStatus.ACTIVE
      : SubscriptionStatus.CANCELLED,
    isAutoRenew,
    expiresAt: transaction.expiresAt,
    cancelledAt: isAutoRenew ? null : signedAt,
    pendingTier: null,
  };
}

function isSameState(a: SubscriptionState, b: SubscriptionState): boolean {
  return (
    a.tier === b.tier &&
    a.status === b.status &&
    a.isAutoRenew === b.isAutoRenew &&
    a.expiresAt.getTime() === b.expiresAt.getTime() &&
    (a.cancelledAt?.getTime() ?? null) === (b.cancelledAt?.getTime() ?? null) &&
    a.pendingTier === b.pendingTier
  );
}

function decide(
  existing: SubscriptionState | null,
  next: SubscriptionState,
): StoreStateDecision {
  return existing !== null && isSameState(existing, next)
    ? { kind: 'unchanged' }
    : { kind: 'apply', state: next };
}

/**
 * **클라이언트가 제출한 유효한 거래**(영수증 제출·복원)를 반영한다. 호출 전에 `classifyTransaction`이
 * `valid`인지 확인한다 — 이 함수는 만료·환불된 거래를 받지 않는다.
 *
 * 거래에는 갱신 설정이 없다(자동 갱신 여부·변경 예약은 서버 알림이 준다). 그래서:
 * - **새 결제 주기**(만료가 더 늦다)면 `active` + 자동 갱신으로 본다 — 갱신·재구독·업그레이드가 방금 일어났다
 * - **같은 주기의 재전송**이면 저장된 갱신 설정을 건드리지 않는다. 해지 예약한 사용자가 앱을 다시 켰다고
 *   `cancelled`가 `active`로 돌아가면 안 된다
 */
export function resolveFromTransaction(
  existing: StoredSubscriptionState | null,
  transaction: StoreTransaction,
  tier: UserTier,
): StoreStateDecision {
  const renewed: SubscriptionState = {
    tier,
    status: SubscriptionStatus.ACTIVE,
    isAutoRenew: true,
    expiresAt: transaction.expiresAt,
    cancelledAt: null,
    pendingTier: null,
  };

  if (existing === null) {
    return { kind: 'apply', state: renewed };
  }

  if (isTerminalStatus(existing.status)) {
    // 환불·만료 통지를 받은 뒤에, 그 전에 서명된 거래를 다시 내는 것은 재사용이다.
    // 종결 뒤에 **새로 시작된** 거래(재구독)만 되살린다
    if (
      existing.lastNotifiedAt !== null &&
      transaction.purchasedAt.getTime() <= existing.lastNotifiedAt.getTime()
    ) {
      return { kind: 'ignore', reason: 'replayed_after_termination' };
    }

    return { kind: 'apply', state: renewed };
  }

  const expiryGap =
    transaction.expiresAt.getTime() - existing.expiresAt.getTime();

  if (expiryGap > 0) {
    return { kind: 'apply', state: renewed };
  }

  // 유예(`grace`) 중에는 `expires_at`이 유예 종료일로 밀려 있어, 직전 주기의 거래가 "앞선 거래"로 보인다 —
  // 권한이 살아 있으니 그대로 둔다
  if (expiryGap < 0) {
    return { kind: 'ignore', reason: 'older_transaction' };
  }

  // 같은 주기 — 티어만 대조한다(같은 거래면 같다)
  return decide(existing, { ...existing, tier });
}

export interface StoreNotificationInput {
  /** 스토어의 알림 유형 원문(App Store `notificationType`) */
  type: string;
  subtype: string | null;
  signedAt: Date;
  transaction: StoreTransaction | null;
  renewal: StoreRenewalInfo | null;
  /** 거래 상품의 티어. 모르는 상품이면 `null` */
  tier: UserTier | null;
  /** 다음 갱신 상품의 티어. 없거나 모르면 `null` */
  renewalTier: UserTier | null;
}

/**
 * App Store Server Notifications V2 → 상태(`subscription-api.md` 4.6의 표).
 *
 * 행이 없어도(영수증 제출보다 알림이 먼저 도착) 거래에서 상태를 만들어 낸다.
 */
export function resolveFromAppStoreNotification(
  existing: StoredSubscriptionState | null,
  input: StoreNotificationInput,
  now: Date,
): StoreStateDecision {
  const { type, subtype, signedAt, transaction, renewal, tier, renewalTier } =
    input;

  if (!HANDLED_APP_STORE_TYPES.has(type)) {
    return { kind: 'ignore', reason: 'unhandled_type' };
  }

  if (transaction === null) {
    return { kind: 'ignore', reason: 'no_transaction' };
  }

  if (tier === null) {
    return { kind: 'ignore', reason: 'unknown_product' };
  }

  if (
    existing !== null &&
    existing.lastNotifiedAt !== null &&
    signedAt.getTime() < existing.lastNotifiedAt.getTime()
  ) {
    return { kind: 'ignore', reason: 'out_of_order' };
  }

  const base: SubscriptionState =
    existing ?? freshState(tier, transaction, renewal, signedAt);
  const isLive = existing !== null && !isTerminalStatus(existing.status);
  /** 저장된 것보다 앞선 주기의 거래에 대한 알림인가(지난 달 결제분의 환불 등) */
  const isOlderPeriod =
    isLive && transaction.expiresAt.getTime() < existing.expiresAt.getTime();
  /** 다음 갱신 상품이 지금과 다르면 변경 예약이다 */
  const pendingTier =
    renewalTier !== null && renewalTier !== tier ? renewalTier : null;

  switch (type) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
    case 'OFFER_REDEEMED': {
      if (isOlderPeriod) {
        return { kind: 'ignore', reason: 'older_transaction' };
      }

      return decide(existing, {
        ...freshState(tier, transaction, renewal, signedAt),
        // 해지 예약한 채 맞은 갱신은 없다 — 꺼져 있었다면 갱신되지 않는다. 예약 시각은 보존만 한다
        cancelledAt:
          renewal?.isAutoRenew === false
            ? (existing?.cancelledAt ?? signedAt)
            : null,
        pendingTier,
      });
    }

    case 'DID_CHANGE_RENEWAL_STATUS': {
      if (existing !== null && !isLive) {
        return { kind: 'ignore', reason: 'terminated' };
      }

      if (subtype === 'AUTO_RENEW_DISABLED') {
        return decide(existing, {
          ...base,
          // 유예 중 해지는 유예를 유지한다 — 재청구가 성공하면 `DID_RENEW`가 정리한다
          status:
            base.status === SubscriptionStatus.GRACE
              ? SubscriptionStatus.GRACE
              : SubscriptionStatus.CANCELLED,
          isAutoRenew: false,
          cancelledAt: existing?.cancelledAt ?? signedAt,
        });
      }

      if (subtype === 'AUTO_RENEW_ENABLED') {
        return decide(existing, {
          ...base,
          status:
            base.status === SubscriptionStatus.GRACE
              ? SubscriptionStatus.GRACE
              : SubscriptionStatus.ACTIVE,
          isAutoRenew: true,
          cancelledAt: null,
        });
      }

      return { kind: 'ignore', reason: 'unhandled_type' };
    }

    case 'DID_CHANGE_RENEWAL_PREF': {
      if (existing !== null && !isLive) {
        return { kind: 'ignore', reason: 'terminated' };
      }

      if (subtype === 'UPGRADE') {
        // 업그레이드는 즉시 적용된다 — 거래가 이미 새 상품이다
        return decide(existing, {
          ...base,
          tier,
          expiresAt: transaction.expiresAt,
          pendingTier: null,
        });
      }

      // DOWNGRADE는 다음 갱신 티어를 예약하고, subtype 없음은 예약 취소다 — 둘 다 "다음 갱신 상품"이 답이다
      return decide(existing, { ...base, pendingTier });
    }

    case 'DID_FAIL_TO_RENEW': {
      if (existing !== null && !isLive) {
        return { kind: 'ignore', reason: 'terminated' };
      }

      if (subtype === 'GRACE_PERIOD') {
        return decide(existing, {
          ...base,
          status: SubscriptionStatus.GRACE,
          // 유예 중에는 "이용 종료일"이 유예 종료일이다 — 화면이 그 날짜를 그린다(`profile-api.md` 4.1)
          expiresAt: renewal?.gracePeriodExpiresAt ?? base.expiresAt,
        });
      }

      // 유예 기간 없이 결제 재시도에 들어갔다 — 그동안 혜택이 없다. 재청구가 성공하면 `DID_RENEW`로 돌아온다
      return decide(existing, {
        ...base,
        status: SubscriptionStatus.EXPIRED,
        isAutoRenew: false,
        pendingTier: null,
      });
    }

    case 'GRACE_PERIOD_EXPIRED':
    case 'EXPIRED': {
      if (isOlderPeriod) {
        return { kind: 'ignore', reason: 'older_transaction' };
      }

      return decide(existing, {
        ...base,
        status: SubscriptionStatus.EXPIRED,
        isAutoRenew: false,
        pendingTier: null,
      });
    }

    case 'REFUND':
    case 'REVOKE': {
      // 지난 주기 결제분만 환불된 것이면 지금 주기는 살아 있다
      if (isOlderPeriod) {
        return { kind: 'ignore', reason: 'older_transaction' };
      }

      return decide(existing, {
        ...base,
        status: SubscriptionStatus.REFUNDED,
        isAutoRenew: false,
        pendingTier: null,
      });
    }

    case 'REFUND_REVERSED': {
      if (
        transaction.expiresAt.getTime() <= now.getTime() ||
        (existing !== null && existing.status !== SubscriptionStatus.REFUNDED)
      ) {
        return { kind: 'ignore', reason: 'terminated' };
      }

      return decide(existing, {
        ...freshState(tier, transaction, renewal, signedAt),
        pendingTier,
      });
    }

    case 'RENEWAL_EXTENDED': {
      if (existing === null || !isLive) {
        return { kind: 'ignore', reason: 'terminated' };
      }

      return decide(existing, { ...base, expiresAt: transaction.expiresAt });
    }

    default:
      return { kind: 'ignore', reason: 'unhandled_type' };
  }
}

const HANDLED_APP_STORE_TYPES: ReadonlySet<string> = new Set([
  'SUBSCRIBED',
  'DID_RENEW',
  'OFFER_REDEEMED',
  'DID_CHANGE_RENEWAL_STATUS',
  'DID_CHANGE_RENEWAL_PREF',
  'DID_FAIL_TO_RENEW',
  'GRACE_PERIOD_EXPIRED',
  'EXPIRED',
  'REFUND',
  'REVOKE',
  'REFUND_REVERSED',
  'RENEWAL_EXTENDED',
]);

/** 스토어에 직접 물어 얻은 "그 구독의 지금 상태" — 만료 보정이 쓴다 */
export type StoreSubscriptionStatus =
  | 'active'
  | 'grace'
  /** 결제 재시도 중(유예 없음) — 혜택이 없다 */
  | 'billing_retry'
  | 'expired'
  | 'revoked';

export interface StoreStatusInput {
  status: StoreSubscriptionStatus;
  transaction: StoreTransaction;
  renewal: StoreRenewalInfo | null;
  tier: UserTier | null;
  renewalTier: UserTier | null;
  /** 조회 시각 — 해지 예약 시각을 모를 때의 대체값 */
  checkedAt: Date;
}

/**
 * 만료 보정(`subscription-api.md` 4.2) — 알림이 유실됐을 때 스토어의 현재 상태로 맞춘다.
 * 알림과 달리 "무슨 일이 있었나"가 아니라 "지금 어떤가"가 들어오므로 순서 판정이 없다.
 */
export function resolveFromStoreStatus(
  existing: StoredSubscriptionState,
  input: StoreStatusInput,
): StoreStateDecision {
  const { status, transaction, renewal, tier, renewalTier, checkedAt } = input;

  if (tier === null) {
    return { kind: 'ignore', reason: 'unknown_product' };
  }

  const pendingTier =
    renewalTier !== null && renewalTier !== tier ? renewalTier : null;

  switch (status) {
    case 'active':
      return decide(existing, {
        ...freshState(tier, transaction, renewal, checkedAt),
        cancelledAt:
          renewal?.isAutoRenew === false
            ? (existing.cancelledAt ?? checkedAt)
            : null,
        pendingTier,
      });

    case 'grace':
      return decide(existing, {
        ...existing,
        tier,
        status: SubscriptionStatus.GRACE,
        expiresAt: renewal?.gracePeriodExpiresAt ?? transaction.expiresAt,
      });

    case 'billing_retry':
    case 'expired':
      return decide(existing, {
        ...existing,
        status: SubscriptionStatus.EXPIRED,
        isAutoRenew: false,
        pendingTier: null,
      });

    case 'revoked':
      return decide(existing, {
        ...existing,
        status: SubscriptionStatus.REFUNDED,
        isAutoRenew: false,
        pendingTier: null,
      });
  }
}
