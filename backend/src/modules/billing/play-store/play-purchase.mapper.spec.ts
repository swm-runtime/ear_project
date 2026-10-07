import {
  SubscriptionEnvironment,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';

import { isEntitled, toPlaySnapshot } from './play-purchase.mapper';
import { PlayPurchase } from './play-store.gateway';

const NOW = new Date('2026-10-10T00:00:00Z');
const STARTED_AT = new Date('2026-10-01T00:00:00Z');
const EXPIRES_AT = new Date('2026-11-01T00:00:00Z');
const PAST = new Date('2026-10-05T00:00:00Z');

function purchase(overrides: Partial<PlayPurchase> = {}): PlayPurchase {
  return {
    purchaseToken: 'token-1',
    linkedPurchaseToken: null,
    productId: 'ear_pro_monthly',
    state: 'active',
    startedAt: STARTED_AT,
    expiresAt: EXPIRES_AT,
    isAutoRenew: true,
    pendingProductId: null,
    accountToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    environment: SubscriptionEnvironment.PRODUCTION,
    needsAcknowledge: false,
    orderId: 'GPA.0000-0000-0000-00000',
    ...overrides,
  };
}

describe('toPlaySnapshot — Google Play 상태 → 우리 의미', () => {
  it('활성 구매를 거래·갱신 정보로 옮긴다 — 영수증 자리는 구매 토큰, 키는 넘겨받은 구독 행의 키다', () => {
    expect(toPlaySnapshot(purchase(), 'first-token', NOW)).toEqual({
      status: 'active',
      transaction: {
        store: SubscriptionStore.PLAY_STORE,
        environment: SubscriptionEnvironment.PRODUCTION,
        originalTransactionId: 'first-token',
        productId: 'ear_pro_monthly',
        originalPurchasedAt: STARTED_AT,
        purchasedAt: STARTED_AT,
        expiresAt: EXPIRES_AT,
        revokedAt: null,
        accountToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        receipt: 'token-1',
        orderId: 'GPA.0000-0000-0000-00000',
      },
      renewal: {
        isAutoRenew: true,
        autoRenewProductId: 'ear_pro_monthly',
        gracePeriodExpiresAt: null,
      },
    });
  });

  it('Play의 "canceled"는 해지 예약이다 — 만료 전이면 유효하고 자동 갱신만 꺼진다', () => {
    const snapshot = toPlaySnapshot(
      // Google이 자동 갱신 값을 켜진 채로 줘도 상태가 우선이다
      purchase({ state: 'canceled', isAutoRenew: true }),
      'token-1',
      NOW,
    );

    expect(snapshot.status).toBe('active');
    expect(snapshot.renewal.isAutoRenew).toBe(false);
  });

  it('해지 예약된 구매의 만료 시각이 지났으면 만료다', () => {
    expect(
      toPlaySnapshot(
        purchase({ state: 'canceled', expiresAt: PAST }),
        'token-1',
        NOW,
      ).status,
    ).toBe('expired');
  });

  it('활성이라고 답해도 만료 시각이 지났으면 만료로 본다', () => {
    expect(
      toPlaySnapshot(purchase({ expiresAt: NOW }), 'token-1', NOW).status,
    ).toBe('expired');
  });

  it('유예 중이면 혜택을 유지하고, 종료 시각은 Google이 준 만료 시각(유예 종료)이다', () => {
    const snapshot = toPlaySnapshot(
      purchase({ state: 'grace' }),
      'token-1',
      NOW,
    );

    expect(snapshot.status).toBe('grace');
    expect(snapshot.renewal.gracePeriodExpiresAt).toEqual(EXPIRES_AT);
  });

  it.each(['on_hold', 'paused'] as const)(
    '%s 는 혜택이 없는 상태다',
    (state) => {
      expect(toPlaySnapshot(purchase({ state }), 'token-1', NOW).status).toBe(
        'billing_retry',
      );
    },
  );

  it('만료·결제 대기를 그대로 옮긴다', () => {
    expect(
      toPlaySnapshot(purchase({ state: 'expired' }), 'token-1', NOW).status,
    ).toBe('expired');
    expect(
      toPlaySnapshot(purchase({ state: 'pending' }), 'token-1', NOW).status,
    ).toBe('pending');
  });

  it('알림이 철회라고 알려 준 구매는 상태와 무관하게 환불이다', () => {
    const snapshot = toPlaySnapshot(purchase(), 'token-1', NOW, {
      isRevoked: true,
    });

    expect(snapshot.status).toBe('revoked');
    expect(snapshot.transaction.revokedAt).toEqual(NOW);
  });

  it('다운그레이드 예약이 있으면 다음 갱신 상품으로 싣는다', () => {
    expect(
      toPlaySnapshot(
        purchase({ pendingProductId: 'ear_daily_monthly' }),
        'token-1',
        NOW,
      ).renewal.autoRenewProductId,
    ).toBe('ear_daily_monthly');
  });
});

describe('isEntitled', () => {
  it('활성·유예만 지금 권한을 준다', () => {
    expect(
      (
        [
          'active',
          'grace',
          'billing_retry',
          'expired',
          'revoked',
          'pending',
        ] as const
      ).filter(isEntitled),
    ).toEqual(['active', 'grace']);
  });
});
