import { UserTier } from '@/modules/user/user.enum';

import {
  SubscriptionEnvironment,
  SubscriptionStatus,
  SubscriptionStore,
} from '../subscription.enum';
import { StoreRenewalInfo, StoreTransaction } from '../subscription.types';
import {
  StoreNotificationInput,
  StoredSubscriptionState,
  classifyTransaction,
  resolveFromAppStoreNotification,
  resolveFromStoreStatus,
  resolveFromTransaction,
} from './store-state.policy';

const NOW = new Date('2026-10-10T00:00:00.000Z');
const PERIOD_START = new Date('2026-10-01T00:00:00.000Z');
const PERIOD_END = new Date('2026-11-01T00:00:00.000Z');
const NEXT_PERIOD_END = new Date('2026-12-01T00:00:00.000Z');

function transaction(
  overrides: Partial<StoreTransaction> = {},
): StoreTransaction {
  return {
    store: SubscriptionStore.APP_STORE,
    environment: SubscriptionEnvironment.SANDBOX,
    originalTransactionId: 'otx-1',
    productId: 'pro.monthly',
    originalPurchasedAt: PERIOD_START,
    purchasedAt: PERIOD_START,
    expiresAt: PERIOD_END,
    revokedAt: null,
    accountToken: null,
    receipt: 'signed',
    ...overrides,
  };
}

function renewal(overrides: Partial<StoreRenewalInfo> = {}): StoreRenewalInfo {
  return {
    isAutoRenew: true,
    autoRenewProductId: 'pro.monthly',
    gracePeriodExpiresAt: null,
    ...overrides,
  };
}

function stored(
  overrides: Partial<StoredSubscriptionState> = {},
): StoredSubscriptionState {
  return {
    tier: UserTier.PRO,
    status: SubscriptionStatus.ACTIVE,
    isAutoRenew: true,
    expiresAt: PERIOD_END,
    cancelledAt: null,
    pendingTier: null,
    lastNotifiedAt: null,
    ...overrides,
  };
}

function notification(
  overrides: Partial<StoreNotificationInput> = {},
): StoreNotificationInput {
  return {
    type: 'DID_RENEW',
    subtype: null,
    signedAt: NOW,
    transaction: transaction(),
    renewal: renewal(),
    tier: UserTier.PRO,
    renewalTier: UserTier.PRO,
    ...overrides,
  };
}

/** 판정이 `apply`일 때의 상태. 아니면 테스트를 실패시킨다 */
function applied(decision: ReturnType<typeof resolveFromTransaction>) {
  if (decision.kind !== 'apply') {
    throw new Error(`expected apply, got ${JSON.stringify(decision)}`);
  }

  return decision.state;
}

describe('classifyTransaction', () => {
  it('만료 전이고 환불되지 않았으면 유효하다', () => {
    expect(classifyTransaction(transaction(), NOW)).toBe('valid');
  });

  it('만료 시각이 지났으면 만료다 — 같은 시각도 만료로 본다', () => {
    expect(classifyTransaction(transaction({ expiresAt: NOW }), NOW)).toBe(
      'expired',
    );
  });

  it('환불·철회 시각이 있으면 만료 전이어도 무효다', () => {
    expect(
      classifyTransaction(transaction({ revokedAt: PERIOD_START }), NOW),
    ).toBe('revoked');
  });
});

describe('resolveFromTransaction — 클라이언트가 제출한 유효한 거래', () => {
  it('행이 없으면 자동 갱신 중인 활성 구독으로 만든다', () => {
    expect(
      applied(resolveFromTransaction(null, transaction(), UserTier.PRO)),
    ).toEqual({
      tier: UserTier.PRO,
      status: SubscriptionStatus.ACTIVE,
      isAutoRenew: true,
      expiresAt: PERIOD_END,
      cancelledAt: null,
      pendingTier: null,
    });
  });

  it('같은 주기의 재전송은 아무것도 바꾸지 않는다', () => {
    expect(
      resolveFromTransaction(stored(), transaction(), UserTier.PRO),
    ).toEqual({ kind: 'unchanged' });
  });

  it('해지 예약한 사용자가 같은 거래를 다시 내도 해지 예약이 풀리지 않는다', () => {
    const cancelled = stored({
      status: SubscriptionStatus.CANCELLED,
      isAutoRenew: false,
      cancelledAt: NOW,
    });

    expect(
      resolveFromTransaction(cancelled, transaction(), UserTier.PRO),
    ).toEqual({ kind: 'unchanged' });
  });

  it('더 늦게 만료되는 거래는 새 결제 주기다 — 만료일을 늘리고 예약을 비운다', () => {
    const state = applied(
      resolveFromTransaction(
        stored({ pendingTier: UserTier.DAILY }),
        transaction({ expiresAt: NEXT_PERIOD_END, productId: 'daily.monthly' }),
        UserTier.DAILY,
      ),
    );

    expect(state).toMatchObject({
      tier: UserTier.DAILY,
      status: SubscriptionStatus.ACTIVE,
      expiresAt: NEXT_PERIOD_END,
      pendingTier: null,
    });
  });

  it('저장된 것보다 앞선 주기의 거래는 반영하지 않는다', () => {
    expect(
      resolveFromTransaction(
        stored({ expiresAt: NEXT_PERIOD_END }),
        transaction(),
        UserTier.PRO,
      ),
    ).toEqual({ kind: 'ignore', reason: 'older_transaction' });
  });

  it('만료된 구독에 새 거래가 오면 재구독으로 되살린다', () => {
    const expired = stored({
      status: SubscriptionStatus.EXPIRED,
      isAutoRenew: false,
      expiresAt: PERIOD_START,
      lastNotifiedAt: PERIOD_START,
    });
    const resubscribe = transaction({
      purchasedAt: new Date('2026-10-05T00:00:00.000Z'),
      expiresAt: new Date('2026-11-05T00:00:00.000Z'),
    });

    expect(
      applied(resolveFromTransaction(expired, resubscribe, UserTier.PRO)),
    ).toMatchObject({ status: SubscriptionStatus.ACTIVE, isAutoRenew: true });
  });

  it('환불 통지 뒤에 그 전에 시작된 거래를 다시 내면 되살리지 않는다', () => {
    // 환불받은 사용자가 환불 전에 받아 둔 서명 거래(환불 표시가 없다)를 다시 제출하는 경우
    const refunded = stored({
      status: SubscriptionStatus.REFUNDED,
      isAutoRenew: false,
      lastNotifiedAt: new Date('2026-10-05T00:00:00.000Z'),
    });

    expect(
      resolveFromTransaction(refunded, transaction(), UserTier.PRO),
    ).toEqual({ kind: 'ignore', reason: 'replayed_after_termination' });
  });

  it('환불된 연간 구독(만료일이 먼 미래) 뒤의 월간 재구독은 만료일이 더 일러도 반영한다', () => {
    const refundedAnnual = stored({
      status: SubscriptionStatus.REFUNDED,
      isAutoRenew: false,
      expiresAt: new Date('2027-10-01T00:00:00.000Z'),
      lastNotifiedAt: new Date('2026-10-05T00:00:00.000Z'),
    });
    const monthly = transaction({
      purchasedAt: new Date('2026-10-06T00:00:00.000Z'),
      expiresAt: new Date('2026-11-06T00:00:00.000Z'),
    });

    expect(
      applied(resolveFromTransaction(refundedAnnual, monthly, UserTier.PRO)),
    ).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      expiresAt: new Date('2026-11-06T00:00:00.000Z'),
    });
  });
});

describe('resolveFromAppStoreNotification — 서버 알림 → 상태', () => {
  it('SUBSCRIBED — 행이 없어도 거래에서 활성 구독을 만든다', () => {
    expect(
      applied(
        resolveFromAppStoreNotification(
          null,
          notification({ type: 'SUBSCRIBED', subtype: 'INITIAL_BUY' }),
          NOW,
        ),
      ),
    ).toMatchObject({
      tier: UserTier.PRO,
      status: SubscriptionStatus.ACTIVE,
      isAutoRenew: true,
      expiresAt: PERIOD_END,
    });
  });

  it('DID_RENEW — 만료일을 늘리고, 다운그레이드 예약이 적용되면 티어가 바뀌고 예약이 비워진다', () => {
    const state = applied(
      resolveFromAppStoreNotification(
        stored({ pendingTier: UserTier.DAILY }),
        notification({
          transaction: transaction({
            productId: 'daily.monthly',
            expiresAt: NEXT_PERIOD_END,
          }),
          renewal: renewal({ autoRenewProductId: 'daily.monthly' }),
          tier: UserTier.DAILY,
          renewalTier: UserTier.DAILY,
        }),
        NOW,
      ),
    );

    expect(state).toMatchObject({
      tier: UserTier.DAILY,
      status: SubscriptionStatus.ACTIVE,
      expiresAt: NEXT_PERIOD_END,
      pendingTier: null,
    });
  });

  it('DID_CHANGE_RENEWAL_STATUS(AUTO_RENEW_DISABLED) — 해지 예약이다. 만료일까지 유효하다', () => {
    const state = applied(
      resolveFromAppStoreNotification(
        stored(),
        notification({
          type: 'DID_CHANGE_RENEWAL_STATUS',
          subtype: 'AUTO_RENEW_DISABLED',
          renewal: renewal({ isAutoRenew: false }),
        }),
        NOW,
      ),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.CANCELLED,
      isAutoRenew: false,
      cancelledAt: NOW,
      expiresAt: PERIOD_END,
    });
  });

  it('DID_CHANGE_RENEWAL_STATUS(AUTO_RENEW_ENABLED) — 해지 예약을 되돌린다', () => {
    const state = applied(
      resolveFromAppStoreNotification(
        stored({
          status: SubscriptionStatus.CANCELLED,
          isAutoRenew: false,
          cancelledAt: PERIOD_START,
        }),
        notification({
          type: 'DID_CHANGE_RENEWAL_STATUS',
          subtype: 'AUTO_RENEW_ENABLED',
        }),
        NOW,
      ),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      isAutoRenew: true,
      cancelledAt: null,
    });
  });

  it('DID_CHANGE_RENEWAL_PREF(UPGRADE) — 티어가 즉시 바뀐다', () => {
    const state = applied(
      resolveFromAppStoreNotification(
        stored({ tier: UserTier.DAILY }),
        notification({
          type: 'DID_CHANGE_RENEWAL_PREF',
          subtype: 'UPGRADE',
          transaction: transaction({ expiresAt: NEXT_PERIOD_END }),
        }),
        NOW,
      ),
    );

    expect(state).toMatchObject({
      tier: UserTier.PRO,
      expiresAt: NEXT_PERIOD_END,
      pendingTier: null,
    });
  });

  it('DID_CHANGE_RENEWAL_PREF(DOWNGRADE) — 티어는 그대로이고 다음 갱신 티어만 예약된다', () => {
    const state = applied(
      resolveFromAppStoreNotification(
        stored(),
        notification({
          type: 'DID_CHANGE_RENEWAL_PREF',
          subtype: 'DOWNGRADE',
          renewal: renewal({ autoRenewProductId: 'daily.monthly' }),
          renewalTier: UserTier.DAILY,
        }),
        NOW,
      ),
    );

    expect(state).toMatchObject({
      tier: UserTier.PRO,
      pendingTier: UserTier.DAILY,
      expiresAt: PERIOD_END,
    });
  });

  it('DID_CHANGE_RENEWAL_PREF(subtype 없음) — 다운그레이드 예약을 취소한다', () => {
    const state = applied(
      resolveFromAppStoreNotification(
        stored({ pendingTier: UserTier.DAILY }),
        notification({ type: 'DID_CHANGE_RENEWAL_PREF', subtype: null }),
        NOW,
      ),
    );

    expect(state.pendingTier).toBeNull();
  });

  it('DID_FAIL_TO_RENEW(GRACE_PERIOD) — 유예다. 혜택을 유지하고 종료일은 유예 종료일이다', () => {
    const graceEnd = new Date('2026-11-17T00:00:00.000Z');
    const state = applied(
      resolveFromAppStoreNotification(
        stored(),
        notification({
          type: 'DID_FAIL_TO_RENEW',
          subtype: 'GRACE_PERIOD',
          renewal: renewal({ gracePeriodExpiresAt: graceEnd }),
        }),
        NOW,
      ),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.GRACE,
      tier: UserTier.PRO,
      expiresAt: graceEnd,
    });
  });

  it('DID_FAIL_TO_RENEW — 지난 주기의 결제 실패 알림이 늦게 오면 이미 갱신된 지금 주기를 건드리지 않는다(2026-10-07)', () => {
    expect(
      resolveFromAppStoreNotification(
        stored({ expiresAt: NEXT_PERIOD_END }),
        notification({
          type: 'DID_FAIL_TO_RENEW',
          subtype: null,
          transaction: transaction({ expiresAt: PERIOD_END }),
        }),
        NOW,
      ),
    ).toEqual({ kind: 'ignore', reason: 'older_transaction' });
  });

  it('DID_FAIL_TO_RENEW(유예 없음) — 만료로 내린다', () => {
    const state = applied(
      resolveFromAppStoreNotification(
        stored(),
        notification({ type: 'DID_FAIL_TO_RENEW', subtype: null }),
        NOW,
      ),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.EXPIRED,
      isAutoRenew: false,
    });
  });

  it.each(['EXPIRED', 'GRACE_PERIOD_EXPIRED'])('%s — 만료다', (type) => {
    const state = applied(
      resolveFromAppStoreNotification(
        stored({ pendingTier: UserTier.DAILY }),
        notification({ type, subtype: 'VOLUNTARY' }),
        NOW,
      ),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.EXPIRED,
      isAutoRenew: false,
      pendingTier: null,
    });
  });

  it.each(['REFUND', 'REVOKE'])(
    '%s — 환불·철회다. 만료 전이어도 즉시 무효다',
    (type) => {
      const state = applied(
        resolveFromAppStoreNotification(
          stored(),
          notification({
            type,
            transaction: transaction({ revokedAt: NOW }),
          }),
          NOW,
        ),
      );

      expect(state).toMatchObject({
        status: SubscriptionStatus.REFUNDED,
        isAutoRenew: false,
        // 만료일은 그대로 남는다 — 환불은 상태로 판정한다(만료일로 판정하면 환불받고도 만료일까지 쓴다)
        expiresAt: PERIOD_END,
      });
    },
  );

  it('REFUND — 지난 결제 주기만 환불된 것이면 지금 주기는 살아 있다', () => {
    expect(
      resolveFromAppStoreNotification(
        stored({ expiresAt: NEXT_PERIOD_END }),
        notification({
          type: 'REFUND',
          transaction: transaction({ revokedAt: NOW }),
        }),
        NOW,
      ),
    ).toEqual({ kind: 'ignore', reason: 'older_transaction' });
  });

  it('REFUND_REVERSED — 만료 전이면 환불 상태를 되돌린다', () => {
    const state = applied(
      resolveFromAppStoreNotification(
        stored({ status: SubscriptionStatus.REFUNDED, isAutoRenew: false }),
        notification({ type: 'REFUND_REVERSED' }),
        NOW,
      ),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      isAutoRenew: true,
    });
  });

  it('RENEWAL_EXTENDED — 만료일만 바꾼다', () => {
    const cancelled = stored({
      status: SubscriptionStatus.CANCELLED,
      isAutoRenew: false,
      cancelledAt: PERIOD_START,
    });
    const state = applied(
      resolveFromAppStoreNotification(
        cancelled,
        notification({
          type: 'RENEWAL_EXTENDED',
          transaction: transaction({ expiresAt: NEXT_PERIOD_END }),
        }),
        NOW,
      ),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.CANCELLED,
      isAutoRenew: false,
      expiresAt: NEXT_PERIOD_END,
    });
  });

  it('마지막으로 반영한 알림보다 먼저 서명된 알림은 상태를 덮지 않는다', () => {
    const later = new Date(NOW.getTime() + 60_000);

    expect(
      resolveFromAppStoreNotification(
        stored({
          status: SubscriptionStatus.EXPIRED,
          isAutoRenew: false,
          lastNotifiedAt: later,
        }),
        notification({ type: 'DID_RENEW', signedAt: NOW }),
        NOW,
      ),
    ).toEqual({ kind: 'ignore', reason: 'out_of_order' });
  });

  it('종결된 구독의 갱신 설정 변경은 되살리지 않는다', () => {
    expect(
      resolveFromAppStoreNotification(
        stored({ status: SubscriptionStatus.REFUNDED, isAutoRenew: false }),
        notification({
          type: 'DID_CHANGE_RENEWAL_STATUS',
          subtype: 'AUTO_RENEW_ENABLED',
        }),
        NOW,
      ),
    ).toEqual({ kind: 'ignore', reason: 'terminated' });
  });

  it('같은 알림이 다시 오면(같은 상태) 쓰지 않는다', () => {
    expect(
      resolveFromAppStoreNotification(stored(), notification(), NOW),
    ).toEqual({ kind: 'unchanged' });
  });

  it.each(['TEST', 'PRICE_INCREASE', 'CONSUMPTION_REQUEST', 'ONE_TIME_CHARGE'])(
    '%s — 상태를 바꾸지 않는 유형이다',
    (type) => {
      expect(
        resolveFromAppStoreNotification(stored(), notification({ type }), NOW),
      ).toEqual({ kind: 'ignore', reason: 'unhandled_type' });
    },
  );

  it('상품이 어느 요금제인지 모르면 반영하지 않는다', () => {
    expect(
      resolveFromAppStoreNotification(
        stored(),
        notification({ tier: null }),
        NOW,
      ),
    ).toEqual({ kind: 'ignore', reason: 'unknown_product' });
  });
});

describe('resolveFromStoreStatus — 만료 보정', () => {
  const overdue = stored({ expiresAt: PERIOD_START });

  it('스토어가 활성이라 답하면(갱신 알림 유실) 새 만료일로 맞춘다', () => {
    const state = applied(
      resolveFromStoreStatus(overdue, {
        status: 'active',
        transaction: transaction(),
        renewal: renewal(),
        tier: UserTier.PRO,
        renewalTier: UserTier.PRO,
        checkedAt: NOW,
      }),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      expiresAt: PERIOD_END,
    });
  });

  it('활성이지만 자동 갱신이 꺼져 있으면 해지 예약이다', () => {
    const state = applied(
      resolveFromStoreStatus(overdue, {
        status: 'active',
        transaction: transaction(),
        renewal: renewal({ isAutoRenew: false }),
        tier: UserTier.PRO,
        renewalTier: null,
        checkedAt: NOW,
      }),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.CANCELLED,
      isAutoRenew: false,
      cancelledAt: NOW,
    });
  });

  it.each(['expired', 'billing_retry'] as const)(
    '스토어가 %s라 답하면 만료로 내린다',
    (status) => {
      const state = applied(
        resolveFromStoreStatus(overdue, {
          status,
          transaction: transaction({ expiresAt: PERIOD_START }),
          renewal: null,
          tier: UserTier.PRO,
          renewalTier: null,
          checkedAt: NOW,
        }),
      );

      expect(state).toMatchObject({
        status: SubscriptionStatus.EXPIRED,
        isAutoRenew: false,
      });
    },
  );

  it('스토어가 철회라 답하면 환불로 내린다', () => {
    const state = applied(
      resolveFromStoreStatus(overdue, {
        status: 'revoked',
        transaction: transaction({ revokedAt: NOW }),
        renewal: null,
        tier: UserTier.PRO,
        renewalTier: null,
        checkedAt: NOW,
      }),
    );

    expect(state.status).toBe(SubscriptionStatus.REFUNDED);
  });

  describe('행이 없을 때(Play의 첫 구매 — 모든 경로가 현재 상태 조회다)', () => {
    it('활성이면 조회 결과로 새 구독 상태를 만든다', () => {
      expect(
        applied(
          resolveFromStoreStatus(null, {
            status: 'active',
            transaction: transaction(),
            renewal: renewal(),
            tier: UserTier.DAILY,
            renewalTier: UserTier.DAILY,
            checkedAt: NOW,
          }),
        ),
      ).toEqual({
        tier: UserTier.DAILY,
        status: SubscriptionStatus.ACTIVE,
        isAutoRenew: true,
        expiresAt: PERIOD_END,
        cancelledAt: null,
        pendingTier: null,
      });
    });

    it('해지 예약된 채로 처음 보면 해지 예약으로 만든다', () => {
      expect(
        applied(
          resolveFromStoreStatus(null, {
            status: 'active',
            transaction: transaction(),
            renewal: renewal({ isAutoRenew: false }),
            tier: UserTier.PRO,
            renewalTier: null,
            checkedAt: NOW,
          }),
        ),
      ).toMatchObject({
        status: SubscriptionStatus.CANCELLED,
        isAutoRenew: false,
        cancelledAt: NOW,
      });
    });

    it('다음 갱신 상품이 다르면 변경 예약을 함께 만든다', () => {
      expect(
        applied(
          resolveFromStoreStatus(null, {
            status: 'active',
            transaction: transaction(),
            renewal: renewal({ autoRenewProductId: 'daily.monthly' }),
            tier: UserTier.PRO,
            renewalTier: UserTier.DAILY,
            checkedAt: NOW,
          }),
        ).pendingTier,
      ).toBe(UserTier.DAILY);
    });

    it('이미 끝난 구독을 처음 보면 종결 상태로 만든다(결제 이력은 남긴다)', () => {
      expect(
        applied(
          resolveFromStoreStatus(null, {
            status: 'revoked',
            transaction: transaction({ revokedAt: NOW }),
            renewal: null,
            tier: UserTier.PRO,
            renewalTier: null,
            checkedAt: NOW,
          }),
        ),
      ).toMatchObject({
        status: SubscriptionStatus.REFUNDED,
        isAutoRenew: false,
      });
    });

    it('상품을 모르면 만들지 않는다', () => {
      expect(
        resolveFromStoreStatus(null, {
          status: 'active',
          transaction: transaction(),
          renewal: renewal(),
          tier: null,
          renewalTier: null,
          checkedAt: NOW,
        }),
      ).toEqual({ kind: 'ignore', reason: 'unknown_product' });
    });
  });

  it('스토어가 유예라 답하면 유예로 두고 종료일을 유예 종료일로 맞춘다', () => {
    const graceEnd = new Date('2026-10-17T00:00:00.000Z');
    const state = applied(
      resolveFromStoreStatus(overdue, {
        status: 'grace',
        transaction: transaction({ expiresAt: PERIOD_START }),
        renewal: renewal({ gracePeriodExpiresAt: graceEnd }),
        tier: UserTier.PRO,
        renewalTier: UserTier.PRO,
        checkedAt: NOW,
      }),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.GRACE,
      expiresAt: graceEnd,
    });
  });
});

describe('resolveFromAppStoreNotification — 유예 중인 구독(2026-10-06)', () => {
  // 유예에 들어갈 때 종료일을 유예 종료일로 밀어 둔다 — 그 뒤의 알림은 거래의 만료일(원래 주기의 끝)이 그보다 이르다
  const GRACE_END = new Date('2026-11-17T00:00:00.000Z');
  const ENTERED_GRACE_AT = new Date('2026-11-01T00:10:00.000Z');
  const AFTER_GRACE = new Date('2026-11-17T00:05:00.000Z');
  const inGrace = stored({
    status: SubscriptionStatus.GRACE,
    expiresAt: GRACE_END,
    lastNotifiedAt: ENTERED_GRACE_AT,
  });

  it.each(['GRACE_PERIOD_EXPIRED', 'EXPIRED'])(
    '%s — 거래의 만료일이 유예 종료일보다 일러도 만료로 내린다',
    (type) => {
      const state = applied(
        resolveFromAppStoreNotification(
          inGrace,
          notification({
            type,
            signedAt: AFTER_GRACE,
            transaction: transaction({ expiresAt: PERIOD_END }),
          }),
          AFTER_GRACE,
        ),
      );

      expect(state).toMatchObject({
        status: SubscriptionStatus.EXPIRED,
        isAutoRenew: false,
      });
    },
  );

  it.each(['REFUND', 'REVOKE'])('%s — 유예 중에도 환불로 내린다', (type) => {
    const at = new Date('2026-11-05T00:00:00.000Z');
    const state = applied(
      resolveFromAppStoreNotification(
        inGrace,
        notification({
          type,
          signedAt: at,
          transaction: transaction({ expiresAt: PERIOD_END, revokedAt: at }),
        }),
        at,
      ),
    );

    expect(state.status).toBe(SubscriptionStatus.REFUNDED);
  });

  it('DID_RENEW(재청구 성공) — 새 만료일이 유예 종료일보다 일러도 유효로 돌아온다', () => {
    const recoveredAt = new Date('2026-11-03T00:00:00.000Z');
    const weeklyEnd = new Date('2026-11-08T00:00:00.000Z');
    const state = applied(
      resolveFromAppStoreNotification(
        inGrace,
        notification({
          type: 'DID_RENEW',
          subtype: 'BILLING_RECOVERY',
          signedAt: recoveredAt,
          transaction: transaction({
            purchasedAt: recoveredAt,
            expiresAt: weeklyEnd,
          }),
        }),
        recoveredAt,
      ),
    );

    expect(state).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      expiresAt: weeklyEnd,
    });
  });

  it('유예에 들어가기 전에 서명된 옛 알림은 여전히 무시한다(서명 시각 순서)', () => {
    expect(
      resolveFromAppStoreNotification(
        inGrace,
        notification({
          type: 'EXPIRED',
          signedAt: new Date('2026-10-31T00:00:00.000Z'),
          transaction: transaction({ expiresAt: PERIOD_START }),
        }),
        AFTER_GRACE,
      ),
    ).toEqual({ kind: 'ignore', reason: 'out_of_order' });
  });

  it('유예가 아닌 구독은 종전대로 — 지난 주기 결제분의 환불은 지금 주기를 건드리지 않는다', () => {
    expect(
      resolveFromAppStoreNotification(
        stored({ expiresAt: NEXT_PERIOD_END }),
        notification({
          type: 'REFUND',
          transaction: transaction({ expiresAt: PERIOD_END, revokedAt: NOW }),
        }),
        NOW,
      ),
    ).toEqual({ kind: 'ignore', reason: 'older_transaction' });
  });
});

describe('resolveFromStoreStatus — 환불로 끝난 Play 구독(4.7, 2026-10-06)', () => {
  const playTransaction = (overrides: Partial<StoreTransaction> = {}) =>
    transaction({
      store: SubscriptionStore.PLAY_STORE,
      receipt: 'token-1',
      ...overrides,
    });
  const refunded = stored({
    status: SubscriptionStatus.REFUNDED,
    isAutoRenew: false,
    latestReceipt: 'token-1',
  });
  const input = (
    status: Parameters<typeof resolveFromStoreStatus>[1]['status'],
    tx: StoreTransaction,
  ) => ({
    status,
    transaction: tx,
    renewal: renewal(),
    tier: UserTier.PRO,
    renewalTier: UserTier.PRO,
    checkedAt: NOW,
  });

  it.each(['active', 'grace', 'billing_retry', 'expired'] as const)(
    '같은 구매 토큰·같은 주기에 Google이 %s라 답해도 환불을 덮지 않는다',
    (status) => {
      expect(
        resolveFromStoreStatus(refunded, input(status, playTransaction())),
      ).toEqual({ kind: 'ignore', reason: 'terminated' });
    },
  );

  it('유예로 만료일만 밀린 것은 결제가 아니다 — 되살리지 않는다', () => {
    expect(
      resolveFromStoreStatus(
        refunded,
        input('grace', playTransaction({ expiresAt: NEXT_PERIOD_END })),
      ),
    ).toEqual({ kind: 'ignore', reason: 'terminated' });
  });

  it('같은 토큰이라도 만료일이 뒤로 간 유효 상태면(그 뒤에 갱신 결제가 됐다) 되살린다', () => {
    expect(
      applied(
        resolveFromStoreStatus(
          refunded,
          input('active', playTransaction({ expiresAt: NEXT_PERIOD_END })),
        ),
      ),
    ).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      expiresAt: NEXT_PERIOD_END,
    });
  });

  it('새 구매 토큰(재구독·요금제 변경)이면 되살린다', () => {
    expect(
      applied(
        resolveFromStoreStatus(
          refunded,
          input('active', playTransaction({ receipt: 'token-2' })),
        ),
      ).status,
    ).toBe(SubscriptionStatus.ACTIVE);
  });

  describe('주문 ID를 아는 행(2026-10-07) — 결제 주기는 주문 ID로 가른다', () => {
    const refundedWithOrder = stored({
      ...refunded,
      latestOrderId: 'GPA.1111-0',
      // 유예 중 환불 — 만료일은 유예 종료일로 밀려 있다
      expiresAt: NEXT_PERIOD_END,
    });

    it('같은 주문의 active 는 만료일이 어떻든 되살리지 않는다', () => {
      expect(
        resolveFromStoreStatus(
          refundedWithOrder,
          input(
            'active',
            playTransaction({
              orderId: 'GPA.1111-0',
              expiresAt: new Date('2026-12-15T00:00:00.000Z'),
            }),
          ),
        ),
      ).toEqual({ kind: 'ignore', reason: 'terminated' });
    });

    it('주문 ID가 바뀌면(재청구 성공·갱신) 새 만료일이 저장값보다 뒤가 아니어도 되살린다 — 유예 길이 ≈ 결제 주기', () => {
      expect(
        applied(
          resolveFromStoreStatus(
            refundedWithOrder,
            input(
              'active',
              playTransaction({
                orderId: 'GPA.1111-0..1',
                expiresAt: NEXT_PERIOD_END,
              }),
            ),
          ),
        ).status,
      ).toBe(SubscriptionStatus.ACTIVE);
    });

    it('조회 결과에 주문 ID가 없으면 종전 규칙(만료일 비교)으로 돌아간다', () => {
      expect(
        resolveFromStoreStatus(
          refundedWithOrder,
          input('active', playTransaction({ orderId: null })),
        ),
      ).toEqual({ kind: 'ignore', reason: 'terminated' });
    });
  });

  it('환불 통지의 재전송은 같은 상태다', () => {
    expect(
      resolveFromStoreStatus(
        refunded,
        input('revoked', playTransaction({ revokedAt: NOW })),
      ),
    ).toEqual({ kind: 'unchanged' });
  });

  it('App Store 구독에는 적용하지 않는다 — 상태 조회가 환불을 직접 답한다', () => {
    expect(
      applied(
        resolveFromStoreStatus(
          stored({
            status: SubscriptionStatus.REFUNDED,
            isAutoRenew: false,
            latestReceipt: 'signed',
          }),
          input('active', transaction()),
        ),
      ).status,
    ).toBe(SubscriptionStatus.ACTIVE);
  });
});
