import { Logger } from '@nestjs/common';

import { SubscriptionEnvironment } from '@/modules/subscription/subscription.enum';
import { StorePurchaseDetail } from '@/modules/subscription/subscription.types';
import { DevicePlatform, UserMarket } from '@/modules/user/user.enum';

import { PlayNotification } from './play-store/play-store.gateway';
import { assembleBilling } from './testing/billing-test-harness';
import {
  FAKE_PLAY_PUSH_TOKEN,
  playPushBody,
  signTransaction,
} from './testing/billing-test-world';

/**
 * 결제 알림(성공 쪽) — `features/backend-monitoring.md` 3-7. 같은 구매가 제출·재제출·복원·스토어 알림으로 여러 번
 * 들어와도 **유효 구독이 처음 생긴 전이에서 한 번만** 나가는지를 실제 결제 코드 위에서 본다.
 */
const USER = 'user-a';
const INTENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const NOW = new Date('2026-10-10T00:00:00Z');
const THIS_PERIOD = {
  originalTransactionId: 'otx-1',
  purchasedAt: new Date('2026-10-01T00:00:00Z'),
  expiresAt: new Date('2026-11-01T00:00:00Z'),
};
const NEXT_PERIOD = {
  originalTransactionId: 'otx-1',
  purchasedAt: new Date('2026-11-01T00:00:00Z'),
  expiresAt: new Date('2026-12-01T00:00:00Z'),
};
const PAID: StorePurchaseDetail = {
  isTrial: false,
  isRenewal: false,
  storefront: 'KOR',
  price: { amount: 9900, currency: 'KRW' },
};

/** 알림은 시장 조회 뒤에 나간다(기다리지 않는 비동기) — 단언 전에 한 번 흘려보낸다 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  const billing = assembleBilling();
  const { world, orchestrator, appStoreWebhook, playStoreWebhook } = billing;

  world.enablePlay();
  world.addUser(USER, { market: UserMarket.KR });
  world.addIntent(USER, INTENT_A);

  const purchase = async (signedTransaction: string, now = NOW) => {
    await orchestrator.submitPurchase({
      userId: USER,
      platform: DevicePlatform.IOS,
      signedTransaction,
      purchaseToken: null,
      now,
    });
    await flush();
  };

  const restore = async (signedTransactions: string[]) => {
    await orchestrator.restorePurchases({
      userId: USER,
      platform: DevicePlatform.IOS,
      signedTransactions,
      purchaseTokens: [],
      now: NOW,
    });
    await flush();
  };

  const notify = async (
    payload: {
      id: string;
      type: string;
      subtype?: string;
      signedAt?: Date;
      transaction?: Parameters<typeof signTransaction>[0] | null;
      renewal?: { isAutoRenew?: boolean } | null;
    },
    now = NOW,
  ) => {
    await appStoreWebhook.handle(
      JSON.stringify({ signedAt: now, ...payload }),
      now,
    );
    await flush();
  };

  const submitPlay = async (purchaseToken: string) => {
    await orchestrator.submitPurchase({
      userId: USER,
      platform: DevicePlatform.ANDROID,
      signedTransaction: null,
      purchaseToken,
      now: NOW,
    });
    await flush();
  };

  const restorePlay = async (purchaseTokens: string[]) => {
    await orchestrator.restorePurchases({
      userId: USER,
      platform: DevicePlatform.ANDROID,
      signedTransactions: [],
      purchaseTokens,
      now: NOW,
    });
    await flush();
  };

  const notifyPlay = async (
    messageId: string,
    notification: Partial<PlayNotification>,
  ) => {
    await playStoreWebhook.handle(
      `Bearer ${FAKE_PLAY_PUSH_TOKEN}`,
      playPushBody(messageId, { kind: 'subscription', ...notification }),
      NOW,
    );
    await flush();
  };

  return {
    ...billing,
    play: world.playGateway,
    purchase,
    restore,
    notify,
    submitPlay,
    restorePlay,
    notifyPlay,
  };
}

const ios = (overrides: Parameters<typeof signTransaction>[0] = {}) =>
  signTransaction({
    ...THIS_PERIOD,
    accountToken: INTENT_A,
    detail: PAID,
    ...overrides,
  });

beforeAll(() => {
  for (const level of ['log', 'warn'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }
});

describe('결제 알림 — App Store (backend-monitoring.md 3-7)', () => {
  it('신규 구독 1건 → 알림 1회. 스토어·환경·요금제·시장·국가·금액·KST 시각을 싣는다', async () => {
    const { purchase, paymentTexts } = setup();

    await purchase(ios());

    expect(paymentTexts).toEqual([
      ':tada: 신규 구독 · App Store · Sandbox(시험 결제) · pro · 시장 KR · 국가 KOR · 9,900 KRW · 10. 10. 09:00',
    ]);
  });

  it('같은 구매의 재제출(앱 재실행)·복원은 다시 알리지 않는다', async () => {
    const { purchase, restore, paymentTexts } = setup();

    await purchase(ios());
    await purchase(ios());
    await restore([ios()]);

    expect(paymentTexts).toHaveLength(1);
  });

  it('스토어 알림(SUBSCRIBED)이 영수증 제출보다 먼저 와도 한 번만 — 먼저 반영한 쪽이 알린다', async () => {
    const { notify, purchase, paymentTexts } = setup();

    await notify({
      id: 'n-1',
      type: 'SUBSCRIBED',
      subtype: 'INITIAL_BUY',
      transaction: { ...THIS_PERIOD, accountToken: INTENT_A, detail: PAID },
    });
    await notify({
      id: 'n-1',
      type: 'SUBSCRIBED',
      subtype: 'INITIAL_BUY',
      transaction: { ...THIS_PERIOD, accountToken: INTENT_A, detail: PAID },
    });
    await purchase(ios());

    expect(paymentTexts).toEqual([
      expect.stringContaining(':tada: 신규 구독 · App Store'),
    ]);
  });

  it('복원으로 처음 연결된 구독은 알리지 않는다 — 지금 결제한 것이 아니다', async () => {
    const { restore, world, paymentTexts } = setup();

    await restore([ios()]);

    expect(world.subscriptions).toHaveLength(1);
    expect(paymentTexts).toEqual([]);
  });

  it('환불 알림(REFUND) → 1회. 같은 알림의 재전송·REVOKE 가 또 와도 한 번이다', async () => {
    const { purchase, notify, paymentTexts } = setup();

    await purchase(ios());
    await notify({
      id: 'n-refund',
      type: 'REFUND',
      transaction: { ...THIS_PERIOD, revokedAt: NOW, detail: PAID },
    });
    await notify({
      id: 'n-refund',
      type: 'REFUND',
      transaction: { ...THIS_PERIOD, revokedAt: NOW, detail: PAID },
    });
    await notify({
      id: 'n-revoke',
      type: 'REVOKE',
      transaction: { ...THIS_PERIOD, revokedAt: NOW, detail: PAID },
    });

    expect(paymentTexts).toHaveLength(2);
    expect(paymentTexts[1]).toBe(
      ':money_with_wings: 환불·철회 · App Store · Sandbox(시험 결제) · pro · 시장 KR · 국가 KOR · 9,900 KRW · 10. 10. 09:00',
    );
  });

  it('해지 예약(자동 갱신 끔) → 1회, 금액 없이. 다시 켰다 끄면 그때 또 알린다', async () => {
    const { purchase, notify, paymentTexts } = setup();

    await purchase(ios());
    await notify({
      id: 'n-off',
      type: 'DID_CHANGE_RENEWAL_STATUS',
      subtype: 'AUTO_RENEW_DISABLED',
      transaction: THIS_PERIOD,
      renewal: { isAutoRenew: false },
    });

    expect(paymentTexts[1]).toBe(
      ':wave: 해지 예약 · App Store · Sandbox(시험 결제) · pro · 시장 KR · 10. 10. 09:00',
    );

    // 해지 예약 중 앱을 다시 켜 같은 거래를 내도 상태가 그대로라 알리지 않는다
    await purchase(ios());
    expect(paymentTexts).toHaveLength(2);
  });

  it('갱신은 알리지 않는다 — 갱신 알림(DID_RENEW)·다음 주기 거래 제출 모두', async () => {
    const { purchase, notify, paymentTexts } = setup();

    await purchase(ios());
    await notify({
      id: 'n-renew',
      type: 'DID_RENEW',
      transaction: { ...NEXT_PERIOD, detail: { ...PAID, isRenewal: true } },
    });
    await purchase(
      ios({ ...NEXT_PERIOD, detail: { ...PAID, isRenewal: true } }),
    );

    expect(paymentTexts).toHaveLength(1);
  });

  it('만료 뒤 새로 결제하면 재구독으로 알린다. 결제 실패 복구(갱신 거래)는 알리지 않는다', async () => {
    const recovered = setup();
    await recovered.purchase(ios());
    await recovered.notify({
      id: 'n-exp',
      type: 'DID_FAIL_TO_RENEW',
      transaction: THIS_PERIOD,
    });
    await recovered.notify(
      {
        id: 'n-recover',
        type: 'DID_RENEW',
        subtype: 'BILLING_RECOVERY',
        transaction: { ...NEXT_PERIOD, detail: { ...PAID, isRenewal: true } },
      },
      new Date('2026-11-02T00:00:00Z'),
    );
    expect(recovered.paymentTexts).toHaveLength(1);

    const resubscribed = setup();
    await resubscribed.purchase(ios());
    await resubscribed.notify({
      id: 'n-exp',
      type: 'EXPIRED',
      transaction: THIS_PERIOD,
    });
    await resubscribed.purchase(
      ios(NEXT_PERIOD),
      new Date('2026-11-02T00:00:00Z'),
    );

    expect(resubscribed.paymentTexts).toHaveLength(2);
    expect(resubscribed.paymentTexts[1]).toContain(':tada: 재구독 · App Store');
  });

  it('운영 결제는 Production, 체험 시작은 체험으로 — 금액은 싣지 않는다', async () => {
    const { purchase, paymentTexts } = setup();

    await purchase(
      ios({
        environment: SubscriptionEnvironment.PRODUCTION,
        detail: {
          ...PAID,
          isTrial: true,
          price: { amount: 0, currency: 'KRW' },
        },
      }),
    );

    expect(paymentTexts).toEqual([
      ':seedling: 무료 체험 시작 · App Store · Production · pro · 시장 KR · 국가 KOR · 10. 10. 09:00',
    ]);
  });

  it('문구에 사용자·거래·계정 토큰·이메일이 없다', async () => {
    const { purchase, notify, paymentTexts } = setup();

    await purchase(ios());
    await notify({
      id: 'n-refund',
      type: 'REFUND',
      transaction: { ...THIS_PERIOD, revokedAt: NOW },
    });

    const all = paymentTexts.join('\n');
    expect(paymentTexts).toHaveLength(2);
    for (const identity of [USER, 'otx-1', INTENT_A, '@example.com']) {
      expect(all).not.toContain(identity);
    }
  });
});

describe('결제 알림 — Google Play (backend-monitoring.md 3-7)', () => {
  it('구매 제출 1건 → 1회. 구매 알림(PURCHASED)·재제출·복원이 뒤따라도 한 번이다', async () => {
    const { play, submitPlay, notifyPlay, restorePlay, paymentTexts } = setup();

    play.put({ purchaseToken: 'token-1', regionCode: 'KR', isTrial: false });
    await submitPlay('token-1');
    await notifyPlay('msg-1', { type: 4, purchaseToken: 'token-1' });
    await submitPlay('token-1');
    await restorePlay(['token-1']);

    expect(paymentTexts).toEqual([
      // Play 구독 조회에는 금액이 없다 — 금액 칸이 빠진다
      ':tada: 신규 구독 · Google Play · Sandbox(시험 결제) · pro · 시장 KR · 국가 KR · 10. 10. 09:00',
    ]);
  });

  it('구매 알림이 제출보다 먼저 오면 알림이 알리고 제출은 조용하다', async () => {
    const { play, submitPlay, notifyPlay, paymentTexts } = setup();

    play.put({ purchaseToken: 'token-1', accountToken: INTENT_A });
    await notifyPlay('msg-1', { type: 4, purchaseToken: 'token-1' });
    await submitPlay('token-1');

    expect(paymentTexts).toEqual([
      expect.stringContaining(':tada: 신규 구독 · Google Play'),
    ]);
  });

  it('복원으로만 연결된 구매는 알리지 않는다', async () => {
    const { play, restorePlay, paymentTexts } = setup();

    play.put({ purchaseToken: 'token-1' });
    await restorePlay(['token-1']);

    expect(paymentTexts).toEqual([]);
  });

  it('철회(유형 12)·환불 통지(voided) → 환불 1회', async () => {
    const { play, submitPlay, notifyPlay, paymentTexts } = setup();

    play.put({ purchaseToken: 'token-1' });
    await submitPlay('token-1');
    await notifyPlay('msg-1', { type: 12, purchaseToken: 'token-1' });
    await notifyPlay('msg-2', {
      kind: 'voided',
      type: null,
      purchaseToken: 'token-1',
    });

    expect(paymentTexts).toHaveLength(2);
    expect(paymentTexts[1]).toContain(
      ':money_with_wings: 환불·철회 · Google Play',
    );
  });

  it('해지(유형 3) → 해지 예약 1회. 갱신(유형 2)·결제 보류에서의 복구(유형 1)는 알리지 않는다', async () => {
    const { play, submitPlay, notifyPlay, paymentTexts } = setup();

    const purchase = play.put({ purchaseToken: 'token-1' });
    await submitPlay('token-1');

    purchase.expiresAt = new Date('2026-12-01T00:00:00Z');
    await notifyPlay('msg-renew', { type: 2, purchaseToken: 'token-1' });

    purchase.state = 'on_hold';
    await notifyPlay('msg-hold', { type: 5, purchaseToken: 'token-1' });
    purchase.state = 'active';
    await notifyPlay('msg-recover', { type: 1, purchaseToken: 'token-1' });
    expect(paymentTexts).toHaveLength(1);

    purchase.state = 'canceled';
    await notifyPlay('msg-cancel', { type: 3, purchaseToken: 'token-1' });

    expect(paymentTexts).toHaveLength(2);
    expect(paymentTexts[1]).toContain(':wave: 해지 예약 · Google Play');
  });
});
