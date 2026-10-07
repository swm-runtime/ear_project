import { HttpStatus, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import {
  PlanStatus,
  PurchaseIntentStatus,
  SubscriptionEnvironment,
  SubscriptionStatus,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';
import { DevicePlatform, UserTier } from '@/modules/user/user.enum';

import { AppStoreVerificationError } from './app-store/app-store.gateway';
import { PlanAction } from './billing.enum';
import { BillingOrchestrator } from './billing.orchestrator';
import { assembleBilling } from './testing/billing-test-harness';
import {
  BillingTestWorld,
  PRODUCT_DAILY,
  PRODUCT_PRO,
  buildTransaction,
  signTransaction,
} from './testing/billing-test-world';

const USER = 'user-a';
const OTHER = 'user-b';
const INTENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INTENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const NOW = new Date('2026-10-10T00:00:00Z');
const THIS_PERIOD = {
  purchasedAt: new Date('2026-10-01T00:00:00Z'),
  expiresAt: new Date('2026-11-01T00:00:00Z'),
};
const NEXT_PERIOD = {
  purchasedAt: new Date('2026-11-01T00:00:00Z'),
  expiresAt: new Date('2026-12-01T00:00:00Z'),
};

function setup() {
  const {
    world,
    orchestrator,
    reconcile,
    appStoreWebhook: webhook,
    slackTexts,
  } = assembleBilling();

  world.addUser(USER);
  world.addUser(OTHER);

  const purchase = (signedTransaction: string, userId = USER, now = NOW) =>
    orchestrator.submitPurchase({
      userId,
      platform: DevicePlatform.IOS,
      signedTransaction,
      purchaseToken: null,
      now,
    });

  const notify = (
    payload: {
      id: string;
      type: string;
      subtype?: string;
      signedAt?: Date;
      transaction?: Parameters<typeof signTransaction>[0] | null;
      renewal?: {
        isAutoRenew?: boolean;
        autoRenewProductId?: string | null;
        gracePeriodExpiresAt?: Date | null;
      } | null;
    },
    now = NOW,
  ) => webhook.handle(JSON.stringify({ signedAt: now, ...payload }), now);

  return { world, orchestrator, reconcile, purchase, notify, slackTexts };
}

async function expectBusinessError(
  work: Promise<unknown>,
  errorCode: ErrorCode,
  status: HttpStatus,
): Promise<BusinessException> {
  const error = await work.then(
    () => {
      throw new Error(`expected ${errorCode} but resolved`);
    },
    (thrown: unknown) => thrown,
  );

  expect(error).toBeInstanceOf(BusinessException);
  expect((error as BusinessException).errorCode).toBe(errorCode);
  expect((error as BusinessException).getStatus()).toBe(status);

  return error as BusinessException;
}

beforeAll(() => {
  // 반영·거절마다 남는 운영 로그는 이 테스트의 관심사가 아니다 — 출력만 어지럽힌다
  for (const level of ['log', 'warn'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }
});

describe('BillingOrchestrator — 요금제 목록(4.1)', () => {
  it('구독이 없으면 무료는 "이용 중"이고 유료는 구독하기다(KAN-147)', async () => {
    const { orchestrator } = setup();

    const catalog = await orchestrator.listPlans(USER, DevicePlatform.IOS);

    expect(catalog.plans.map((plan) => [plan.tier, plan.action])).toEqual([
      [UserTier.LIGHT, PlanAction.CURRENT],
      [UserTier.DAILY, PlanAction.PURCHASE],
      [UserTier.PRO, PlanAction.PURCHASE],
    ]);
    expect(catalog.plans[2]).toMatchObject({
      storeProductId: PRODUCT_PRO,
      priceKrw: 9900,
      entitlements: { dailyPlayLimit: null, adsEnabled: false },
    });
    expect(catalog.isEmailVerified).toBe(true);
  });

  it('데일리 구독자에게 프로는 업그레이드, 프로 구독자에게 데일리는 변경(다운그레이드)이다', async () => {
    const { orchestrator, purchase } = setup();

    await purchase(
      signTransaction({ ...THIS_PERIOD, productId: PRODUCT_DAILY }),
    );
    const asDaily = await orchestrator.listPlans(USER, DevicePlatform.IOS);
    expect(asDaily.plans.map((plan) => plan.action)).toEqual([
      PlanAction.NONE,
      PlanAction.CURRENT,
      PlanAction.UPGRADE,
    ]);

    // 업그레이드 — 같은 스토어 구독에 더 늦게 끝나는 프로 거래가 온다
    await purchase(
      signTransaction({
        purchasedAt: new Date('2026-10-05T00:00:00Z'),
        expiresAt: new Date('2026-11-05T00:00:00Z'),
        productId: PRODUCT_PRO,
      }),
    );
    const asPro = await orchestrator.listPlans(USER, DevicePlatform.IOS);
    expect(asPro.plans.map((plan) => plan.action)).toEqual([
      PlanAction.NONE,
      PlanAction.DOWNGRADE,
      PlanAction.CURRENT,
    ]);
  });

  it('그 플랫폼에서 살 수 없으면(Android·검증 미구성) 유료 요금제는 버튼이 없다 — 무료는 여전히 이용 중', async () => {
    const { world, orchestrator } = setup();
    const paid = (plans: { priceKrw: number; action: PlanAction }[]) =>
      plans.filter((plan) => plan.priceKrw > 0);

    const android = await orchestrator.listPlans(USER, DevicePlatform.ANDROID);
    expect(
      paid(android.plans).every((plan) => plan.action === PlanAction.NONE),
    ).toBe(true);
    expect(android.plans[0].action).toBe(PlanAction.CURRENT);
    expect(android.plans.every((plan) => plan.storeProductId === null)).toBe(
      true,
    );

    world.gateway.enabled = false;
    const ios = await orchestrator.listPlans(USER, DevicePlatform.IOS);
    expect(
      paid(ios.plans).every((plan) => plan.action === PlanAction.NONE),
    ).toBe(true);
  });

  it('다른 스토어에서 구독 중이면 이용 중 표시만 있고 나머지 유료 요금제는 버튼이 없다', async () => {
    const { world, orchestrator, purchase } = setup();

    await purchase(
      signTransaction({ ...THIS_PERIOD, productId: PRODUCT_DAILY }),
    );
    world.subscriptions[0].store = SubscriptionStore.PLAY_STORE;

    const catalog = await orchestrator.listPlans(USER, DevicePlatform.IOS);

    expect(catalog.plans.map((plan) => plan.action)).toEqual([
      PlanAction.NONE,
      PlanAction.CURRENT,
      PlanAction.NONE,
    ]);
  });

  it('인증된 이메일이 없으면 is_email_verified가 false다', async () => {
    const { world, orchestrator } = setup();

    world.addUser(USER, { email: 'a@example.com', isEmailVerified: false });
    expect(
      (await orchestrator.listPlans(USER, DevicePlatform.IOS)).isEmailVerified,
    ).toBe(false);

    world.addUser(USER, { email: null, isEmailVerified: true });
    expect(
      (await orchestrator.listPlans(USER, DevicePlatform.IOS)).isEmailVerified,
    ).toBe(false);
  });
});

describe('BillingOrchestrator — 결제 의도(4.3)', () => {
  const command = {
    userId: USER,
    planId: 'plan-pro',
    platform: DevicePlatform.IOS,
    entryPoint: null,
  };

  it('통과하면 의도를 만들고 그 id와 상품 ID를 돌려준다', async () => {
    const { world, orchestrator } = setup();

    const result = await orchestrator.createPurchaseIntent(command);

    expect(result.storeProductId).toBe(PRODUCT_PRO);
    expect(world.intents).toEqual([
      expect.objectContaining({
        id: result.intentId,
        userId: USER,
        planId: 'plan-pro',
        status: PurchaseIntentStatus.CREATED,
      }),
    ]);
  });

  it('인증된 이메일이 없으면 요금제를 보기도 전에 거부한다', async () => {
    const { world, orchestrator } = setup();

    world.addUser(USER, { isEmailVerified: false });

    await expectBusinessError(
      orchestrator.createPurchaseIntent({ ...command, planId: 'no-such-plan' }),
      ErrorCode.EMAIL_REQUIRED_FOR_PURCHASE,
      HttpStatus.CONFLICT,
    );
    expect(world.intents).toHaveLength(0);
  });

  it.each([
    ['없는 요금제', { planId: 'no-such-plan' }],
    ['무료 요금제', { planId: 'plan-light' }],
    ['그 플랫폼에 상품이 없는 요금제', { platform: DevicePlatform.ANDROID }],
  ])('%s는 구독할 수 없다', async (_label, overrides) => {
    const { world, orchestrator } = setup();

    await expectBusinessError(
      orchestrator.createPurchaseIntent({ ...command, ...overrides }),
      ErrorCode.SUBSCRIPTION_PLAN_UNAVAILABLE,
      HttpStatus.BAD_REQUEST,
    );
    expect(world.intents).toHaveLength(0);
  });

  it('판매를 멈춘 요금제와 검증 구성이 없는 서버도 의도 단계에서 막는다', async () => {
    const { world, orchestrator } = setup();

    world.plans[2].isActive = false;
    await expectBusinessError(
      orchestrator.createPurchaseIntent(command),
      ErrorCode.SUBSCRIPTION_PLAN_UNAVAILABLE,
      HttpStatus.BAD_REQUEST,
    );

    world.plans[2].isActive = true;
    world.gateway.enabled = false;
    await expectBusinessError(
      orchestrator.createPurchaseIntent(command),
      ErrorCode.SUBSCRIPTION_PLAN_UNAVAILABLE,
      HttpStatus.BAD_REQUEST,
    );
  });

  it('다른 스토어에서 구독 중이면 이중 결제를 막는다', async () => {
    const { world, orchestrator, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    world.subscriptions[0].store = SubscriptionStore.PLAY_STORE;

    await expectBusinessError(
      orchestrator.createPurchaseIntent(command),
      ErrorCode.SUBSCRIPTION_STORE_MISMATCH,
      HttpStatus.CONFLICT,
    );
  });

  it('이미 같은 요금제를 구독 중이어도 의도는 만든다 — 만료 뒤 재구독이 같은 경로다', async () => {
    const { orchestrator, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));

    await expect(
      orchestrator.createPurchaseIntent(command),
    ).resolves.toMatchObject({ storeProductId: PRODUCT_PRO });
  });
});

describe('BillingOrchestrator — 영수증 제출(4.4)', () => {
  it('유효한 거래면 구독 행과 사용자 티어를 한 트랜잭션에서 반영하고 그 상태를 돌려준다', async () => {
    const { world, purchase } = setup();

    world.addIntent(USER, INTENT_A);
    const view = await purchase(
      signTransaction({ ...THIS_PERIOD, accountToken: INTENT_A }),
    );

    expect(world.transactionCount).toBe(1);
    expect(world.subscriptions).toEqual([
      expect.objectContaining({
        userId: USER,
        tier: UserTier.PRO,
        status: SubscriptionStatus.ACTIVE,
        isAutoRenew: true,
        store: SubscriptionStore.APP_STORE,
        environment: SubscriptionEnvironment.SANDBOX,
        originalTransactionId: 'otx-1',
        expiresAt: THIS_PERIOD.expiresAt,
        pendingTier: null,
        lastNotifiedAt: null,
      }),
    ]);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect(world.intents[0].status).toBe(PurchaseIntentStatus.VERIFIED);
    expect(view).toMatchObject({
      plan: {
        status: PlanStatus.SUBSCRIBED,
        tier: UserTier.PRO,
        renewsAt: THIS_PERIOD.expiresAt,
      },
      entitlements: { dailyPlayLimit: null, adsEnabled: false },
      store: SubscriptionStore.APP_STORE,
      pendingPlan: null,
    });
  });

  it('같은 거래를 다시 보내도 같은 결과다(행이 늘지 않는다)', async () => {
    const { world, purchase } = setup();

    const first = await purchase(signTransaction(THIS_PERIOD));
    const second = await purchase(signTransaction(THIS_PERIOD));

    expect(world.subscriptions).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it('서명된 거래의 상품으로 티어를 정한다 — 데일리 상품이면 데일리다', async () => {
    const { world, purchase } = setup();

    const view = await purchase(
      signTransaction({ ...THIS_PERIOD, productId: PRODUCT_DAILY }),
    );

    expect(world.users.get(USER)!.tier).toBe(UserTier.DAILY);
    expect(view.entitlements.dailyPlayLimit).toBe(5);
  });

  it.each([
    ['만료된 거래', { expiresAt: new Date('2026-10-09T00:00:00Z') }],
    [
      '환불된 거래',
      { ...THIS_PERIOD, revokedAt: new Date('2026-10-05T00:00:00Z') },
    ],
    ['모르는 상품의 거래', { ...THIS_PERIOD, productId: 'com.other.product' }],
    ['서명이 틀린 거래', { invalid: 'invalid' as const }],
  ])('%s는 받지 않고 아무것도 쓰지 않는다', async (_label, overrides) => {
    const { world, purchase } = setup();

    const error = await expectBusinessError(
      purchase(signTransaction(overrides)),
      ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      HttpStatus.BAD_REQUEST,
    );

    expect(error.retryable).toBe(false);
    expect(world.subscriptions).toHaveLength(0);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('스토어 확인이 일시적으로 실패하면 재시도 가능한 503이다 — 거래를 끝내지 않게 한다', async () => {
    const { world, purchase } = setup();

    const error = await expectBusinessError(
      purchase(signTransaction({ invalid: 'unavailable' })),
      ErrorCode.SUBSCRIPTION_STORE_UNAVAILABLE,
      HttpStatus.SERVICE_UNAVAILABLE,
    );

    expect(error.retryable).toBe(true);
    expect(world.subscriptions).toHaveLength(0);
  });

  it('Android와 검증 구성이 없는 서버는 구독할 수 없음으로 답한다', async () => {
    const { world, orchestrator, purchase } = setup();

    await expectBusinessError(
      orchestrator.submitPurchase({
        userId: USER,
        platform: DevicePlatform.ANDROID,
        signedTransaction: null,
        purchaseToken: 'any-token',
        now: NOW,
      }),
      ErrorCode.SUBSCRIPTION_PLAN_UNAVAILABLE,
      HttpStatus.BAD_REQUEST,
    );

    world.gateway.enabled = false;
    await expectBusinessError(
      purchase(signTransaction(THIS_PERIOD)),
      ErrorCode.SUBSCRIPTION_PLAN_UNAVAILABLE,
      HttpStatus.BAD_REQUEST,
    );
  });

  it('다른 계정에 연결된 스토어 구독은 받지 않는다', async () => {
    const { world, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD), OTHER);

    await expectBusinessError(
      purchase(signTransaction(THIS_PERIOD), USER),
      ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
      HttpStatus.CONFLICT,
    );
    expect(world.subscriptions[0].userId).toBe(OTHER);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('남이 시작한 결제의 거래를 주워 제출하면 받지 않는다(계정 결속 토큰)', async () => {
    const { world, purchase } = setup();

    // OTHER가 결제를 시작했지만 아직 제출하지 않았다 — 구독 행은 없고 의도만 있다
    world.addIntent(OTHER, INTENT_B);

    await expectBusinessError(
      purchase(
        signTransaction({ ...THIS_PERIOD, accountToken: INTENT_B }),
        USER,
      ),
      ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
      HttpStatus.CONFLICT,
    );
    expect(world.subscriptions).toHaveLength(0);
  });

  it('탈퇴한 계정의 스토어 구독은 재가입한 계정에 연결된다', async () => {
    const { world, purchase } = setup();

    world.addIntent(OTHER, INTENT_B);
    await purchase(
      signTransaction({ ...THIS_PERIOD, accountToken: INTENT_B }),
      OTHER,
    );
    world.withdraw(OTHER);

    // 같은 스토어 계정이 새 앱 계정에서 그 거래를 다시 낸다 — 토큰은 파기된 의도를 가리킨다
    await purchase(
      signTransaction({ ...THIS_PERIOD, accountToken: INTENT_B }),
      USER,
    );

    expect(world.subscriptions).toEqual([
      expect.objectContaining({ userId: USER, tier: UserTier.PRO }),
    ]);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it('환불 통지 뒤에 환불 전 거래를 다시 내면 권한을 되살리지 않는다', async () => {
    const { world, purchase, notify } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    await notify({
      id: 'n-refund',
      type: 'REFUND',
      transaction: { ...THIS_PERIOD, revokedAt: NOW },
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);

    // 환불 전에 기기에 받아 둔 서명 거래 — 환불 표시가 없어 그 자체로는 유효해 보인다
    await expectBusinessError(
      purchase(signTransaction(THIS_PERIOD)),
      ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.REFUNDED);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });
});

describe('BillingOrchestrator — 구매 복원(4.5)', () => {
  const restore = (
    orchestrator: BillingOrchestrator,
    signedTransactions: string[],
    userId = USER,
  ) =>
    orchestrator.restorePurchases({
      userId,
      platform: DevicePlatform.IOS,
      signedTransactions,
      purchaseTokens: [],
      now: NOW,
    });

  it('보낼 거래가 없으면 오류가 아니라 "복원할 구독 없음"이다', async () => {
    const { orchestrator } = setup();

    const result = await restore(orchestrator, []);

    expect(result.restored).toBe(false);
    expect(result.subscription.plan.status).toBe(PlanStatus.FREE);
  });

  it('유효한 거래를 연결하고 티어를 반영한다', async () => {
    const { world, orchestrator } = setup();

    const result = await restore(orchestrator, [signTransaction(THIS_PERIOD)]);

    expect(result.restored).toBe(true);
    expect(result.subscription.plan.tier).toBe(UserTier.PRO);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it('이미 연결돼 있던 구독도 복원된 것으로 답한다', async () => {
    const { orchestrator, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));

    expect(
      (await restore(orchestrator, [signTransaction(THIS_PERIOD)])).restored,
    ).toBe(true);
  });

  it('만료·환불된 거래는 오류가 아니라 무시한다', async () => {
    const { world, orchestrator } = setup();

    const result = await restore(orchestrator, [
      signTransaction({ expiresAt: new Date('2026-09-01T00:00:00Z') }),
      signTransaction({
        ...THIS_PERIOD,
        originalTransactionId: 'otx-2',
        revokedAt: NOW,
      }),
    ]);

    expect(result.restored).toBe(false);
    expect(world.subscriptions).toHaveLength(0);
  });

  it('다른 계정의 구독이 하나라도 섞이면 요청 전체를 거부하고 아무것도 반영하지 않는다', async () => {
    const { world, orchestrator, purchase } = setup();

    await purchase(
      signTransaction({ ...THIS_PERIOD, originalTransactionId: 'otx-other' }),
      OTHER,
    );

    await expectBusinessError(
      restore(orchestrator, [
        signTransaction({ ...THIS_PERIOD, originalTransactionId: 'otx-mine' }),
        signTransaction({ ...THIS_PERIOD, originalTransactionId: 'otx-other' }),
      ]),
      ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
      HttpStatus.CONFLICT,
    );

    expect(world.subscriptions.map((row) => row.originalTransactionId)).toEqual(
      ['otx-other'],
    );
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('위조로 보이는 거래가 섞이면 요청 전체가 오류다', async () => {
    const { world, orchestrator } = setup();

    await expectBusinessError(
      restore(orchestrator, [
        signTransaction(THIS_PERIOD),
        signTransaction({ invalid: 'invalid' }),
      ]),
      ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
    expect(world.subscriptions).toHaveLength(0);
  });
});

describe('AppStoreWebhookService — 스토어 서버 알림(4.6)', () => {
  it('해지 예약 알림 — 만료일까지 유효하고 화면은 해지 예약으로 그린다', async () => {
    const { world, orchestrator, purchase, notify } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    await notify({
      id: 'n-1',
      type: 'DID_CHANGE_RENEWAL_STATUS',
      subtype: 'AUTO_RENEW_DISABLED',
      transaction: THIS_PERIOD,
      renewal: { isAutoRenew: false },
    });

    expect(world.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.CANCELLED,
      isAutoRenew: false,
      lastNotifiedAt: NOW,
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect((await orchestrator.getSubscription(USER, NOW)).plan).toMatchObject({
      status: PlanStatus.CANCEL_SCHEDULED,
      expiresAt: THIS_PERIOD.expiresAt,
    });
    expect(world.notificationLogs[0].processedAt).toEqual(NOW);
  });

  it('갱신 알림 — 만료일이 늘어난다', async () => {
    const { world, purchase, notify } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    await notify({ id: 'n-1', type: 'DID_RENEW', transaction: NEXT_PERIOD });

    expect(world.subscriptions[0].expiresAt).toEqual(NEXT_PERIOD.expiresAt);
  });

  it.each([
    ['EXPIRED', SubscriptionStatus.EXPIRED],
    ['REFUND', SubscriptionStatus.REFUNDED],
  ])('%s 알림 — 사용자 티어가 즉시 무료로 내려간다', async (type, status) => {
    const { world, orchestrator, purchase, notify } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    await notify({ id: 'n-1', type, transaction: THIS_PERIOD });

    expect(world.subscriptions[0].status).toBe(status);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
    expect(await orchestrator.getSubscription(USER, NOW)).toMatchObject({
      plan: { status: PlanStatus.FREE, tier: UserTier.LIGHT },
      entitlements: { dailyPlayLimit: 2, adsEnabled: true },
      store: null,
    });
  });

  it('다운그레이드 예약 알림 — 티어는 그대로이고 "언제부터 어느 요금제"가 내려간다', async () => {
    const { world, orchestrator, purchase, notify } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    await notify({
      id: 'n-1',
      type: 'DID_CHANGE_RENEWAL_PREF',
      subtype: 'DOWNGRADE',
      transaction: THIS_PERIOD,
      renewal: { autoRenewProductId: PRODUCT_DAILY },
    });

    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect((await orchestrator.getSubscription(USER, NOW)).pendingPlan).toEqual(
      {
        tier: UserTier.DAILY,
        planName: 'Daily',
        effectiveAt: THIS_PERIOD.expiresAt,
      },
    );
  });

  it('영수증 제출보다 알림이 먼저 오면 계정 토큰으로 사용자를 찾아 구독을 만든다', async () => {
    const { world, notify } = setup();

    world.addIntent(USER, INTENT_A);
    await notify({
      id: 'n-1',
      type: 'SUBSCRIBED',
      subtype: 'INITIAL_BUY',
      transaction: { ...THIS_PERIOD, accountToken: INTENT_A },
      renewal: { autoRenewProductId: PRODUCT_PRO },
    });

    expect(world.subscriptions).toEqual([
      expect.objectContaining({
        userId: USER,
        tier: UserTier.PRO,
        lastNotifiedAt: NOW,
      }),
    ]);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect(world.intents[0].status).toBe(PurchaseIntentStatus.VERIFIED);
  });

  it('어느 계정의 구독인지 모르는 알림은 받아 두되 처리 완료로 표시하지 않는다', async () => {
    const { world, purchase, notify } = setup();

    await notify({ id: 'n-1', type: 'SUBSCRIBED', transaction: THIS_PERIOD });

    expect(world.subscriptions).toHaveLength(0);
    expect(world.notificationLogs).toEqual([
      expect.objectContaining({ notificationId: 'n-1', processedAt: null }),
    ]);

    // 이후 영수증 제출이 연결한다
    await purchase(signTransaction(THIS_PERIOD));
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it('이미 처리한 알림의 재전송은 다시 반영하지 않는다', async () => {
    const { world, purchase, notify } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    await notify({ id: 'n-1', type: 'EXPIRED', transaction: THIS_PERIOD });

    // 그 사이 재구독해 살아났다 — 같은 만료 알림이 다시 와도 내려가면 안 된다
    world.subscriptions[0].status = SubscriptionStatus.ACTIVE;
    world.users.get(USER)!.tier = UserTier.PRO;
    await notify({ id: 'n-1', type: 'EXPIRED', transaction: THIS_PERIOD });

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
    expect(world.notificationLogs).toHaveLength(1);
  });

  it('순서가 뒤바뀐 옛 알림은 최신 상태를 덮지 않는다', async () => {
    const { world, purchase, notify } = setup();
    const earlier = new Date(NOW.getTime() - 60_000);

    await purchase(signTransaction(THIS_PERIOD));
    await notify({ id: 'n-2', type: 'EXPIRED', transaction: THIS_PERIOD });
    await notify({
      id: 'n-1',
      type: 'DID_CHANGE_RENEWAL_STATUS',
      subtype: 'AUTO_RENEW_ENABLED',
      signedAt: earlier,
      transaction: THIS_PERIOD,
    });

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.EXPIRED);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
    // 반영하지 않았어도 판정은 끝났다 — Apple이 다시 보내지 않게 처리 완료로 둔다
    expect(world.notificationLogs.every((log) => log.processedAt)).toBe(true);
  });

  it('서명이 틀린 알림은 400, 확인이 일시 실패하면 503이다 — 어느 쪽도 적재하지 않는다', async () => {
    const { world, notify } = setup();

    await expectBusinessError(
      notify({ id: 'n-1', type: 'TEST', ...{ invalid: 'invalid' } }),
      ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
    await expectBusinessError(
      notify({ id: 'n-2', type: 'TEST', ...{ invalid: 'unavailable' } }),
      ErrorCode.SUBSCRIPTION_STORE_UNAVAILABLE,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(world.notificationLogs).toHaveLength(0);
  });

  it('상태를 바꾸지 않는 유형(TEST)은 적재하고 처리 완료로 끝낸다', async () => {
    const { world, notify } = setup();

    await notify({ id: 'n-1', type: 'TEST', transaction: null });

    expect(world.notificationLogs).toEqual([
      expect.objectContaining({ type: 'TEST', processedAt: NOW }),
    ]);
  });
});

describe('SubscriptionReconcileService — 만료 보정(4.2)', () => {
  const AFTER_EXPIRY = new Date('2026-11-01T02:00:00Z');

  it('만료일이 1시간 넘게 지났는데 유효로 남은 구독은 스토어 상태로 맞춘 뒤 응답한다', async () => {
    const { world, orchestrator, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    world.gateway.statuses.set('otx-1', {
      status: 'expired',
      transaction: buildTransaction(THIS_PERIOD),
      renewal: null,
    });

    const view = await orchestrator.getSubscription(USER, AFTER_EXPIRY);

    expect(view.plan.status).toBe(PlanStatus.FREE);
    expect(world.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.EXPIRED,
      lastNotifiedAt: AFTER_EXPIRY,
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('갱신 알림이 유실됐을 뿐이면(스토어는 활성) 만료일을 늘리고 유료를 유지한다', async () => {
    const { world, orchestrator, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    world.gateway.statuses.set('otx-1', {
      status: 'active',
      transaction: buildTransaction(NEXT_PERIOD),
      renewal: {
        isAutoRenew: true,
        autoRenewProductId: PRODUCT_PRO,
        gracePeriodExpiresAt: null,
      },
    });

    const view = await orchestrator.getSubscription(USER, AFTER_EXPIRY);

    expect(view.plan).toMatchObject({
      status: PlanStatus.SUBSCRIBED,
      renewsAt: NEXT_PERIOD.expiresAt,
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it('만료 직후(1시간 이내)에는 스토어에 묻지 않는다 — 갱신 알림을 기다린다', async () => {
    const { world, orchestrator, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    world.gateway.statuses.set('otx-1', {
      status: 'expired',
      transaction: buildTransaction(THIS_PERIOD),
      renewal: null,
    });

    await orchestrator.getSubscription(USER, new Date('2026-11-01T00:30:00Z'));

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
  });

  it.each([
    [
      '스토어에 물을 수 없으면(키 미구성)',
      (world: BillingTestWorld) => {
        world.gateway.statusQueryable = false;
      },
    ],
    [
      '스토어 조회가 실패하면',
      (world: BillingTestWorld) => {
        world.gateway.fetchStatusError = new AppStoreVerificationError(
          'unavailable',
          'fake',
        );
      },
    ],
    ['스토어가 그 거래를 모르면', () => undefined],
  ])(
    '%s 추측으로 강등하지 않고 저장된 상태 그대로 응답한다',
    async (_label, arrange) => {
      const { world, orchestrator, purchase } = setup();

      await purchase(signTransaction(THIS_PERIOD));
      arrange(world);

      const view = await orchestrator.getSubscription(USER, AFTER_EXPIRY);

      expect(view.plan.tier).toBe(UserTier.PRO);
      expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
      expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    },
  );

  it('배치는 보정 대상 전부를 보고 맞춘 건수를 돌려준다', async () => {
    const { world, reconcile, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    await purchase(
      signTransaction({ ...THIS_PERIOD, originalTransactionId: 'otx-2' }),
      OTHER,
    );
    world.gateway.statuses.set('otx-1', {
      status: 'expired',
      transaction: buildTransaction(THIS_PERIOD),
      renewal: null,
    });
    // otx-2 는 스토어가 모른다 → 그대로 둔다

    expect(await reconcile.reconcileOverdue(AFTER_EXPIRY)).toBe(1);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
    expect(world.users.get(OTHER)!.tier).toBe(UserTier.PRO);
  });
});

describe('유예 중인 구독의 종료(4.6 — 2026-10-06)', () => {
  const GRACE_END = new Date('2026-11-17T00:00:00Z');

  async function enterGrace() {
    const context = setup();

    await context.purchase(signTransaction(THIS_PERIOD));
    await context.notify(
      {
        id: 'n-grace',
        type: 'DID_FAIL_TO_RENEW',
        subtype: 'GRACE_PERIOD',
        transaction: THIS_PERIOD,
        renewal: { gracePeriodExpiresAt: GRACE_END },
      },
      new Date('2026-11-01T00:10:00Z'),
    );
    expect(context.world.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.GRACE,
      expiresAt: GRACE_END,
    });

    return context;
  }

  it('유예 종료 알림이 오면 무료로 내려간다 — 거래의 만료일은 유예 종료일보다 이르다', async () => {
    const { world, notify } = await enterGrace();

    await notify(
      {
        id: 'n-grace-end',
        type: 'GRACE_PERIOD_EXPIRED',
        transaction: THIS_PERIOD,
      },
      new Date('2026-11-17T00:05:00Z'),
    );

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.EXPIRED);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('유예 중 환불 알림이 오면 즉시 무효다', async () => {
    const { world, notify } = await enterGrace();
    const at = new Date('2026-11-05T00:00:00Z');

    await notify(
      {
        id: 'n-refund',
        type: 'REFUND',
        transaction: { ...THIS_PERIOD, revokedAt: at },
      },
      at,
    );

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.REFUNDED);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('유예 중 재청구가 성공하면 유효로 돌아온다', async () => {
    const { world, notify } = await enterGrace();

    await notify(
      {
        id: 'n-recovered',
        type: 'DID_RENEW',
        subtype: 'BILLING_RECOVERY',
        transaction: NEXT_PERIOD,
      },
      new Date('2026-11-03T00:00:00Z'),
    );

    expect(world.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      expiresAt: NEXT_PERIOD.expiresAt,
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });
});

describe('끝난 구독의 재결제 — 다른 계정이 넘겨받는다(7장 주인 확인 — 2026-10-06)', () => {
  const AFTER_EXPIRY = new Date('2026-11-05T00:00:00Z');
  const REPURCHASE = {
    purchasedAt: new Date('2026-11-05T00:00:00Z'),
    expiresAt: new Date('2026-12-05T00:00:00Z'),
    accountToken: INTENT_A,
  };

  /** OTHER가 구독했다가 만료된 뒤, 같은 스토어 계정으로 USER가 결제를 시작한 상태 */
  async function setupExpiredOwnedByOther() {
    const context = setup();
    const { world, purchase, notify } = context;

    world.addIntent(OTHER, INTENT_B);
    await purchase(
      signTransaction({ ...THIS_PERIOD, accountToken: INTENT_B }),
      OTHER,
    );
    await notify(
      {
        id: 'n-expired',
        type: 'EXPIRED',
        transaction: { ...THIS_PERIOD, accountToken: INTENT_B },
      },
      new Date('2026-11-01T00:05:00Z'),
    );
    expect(world.users.get(OTHER)!.tier).toBe(UserTier.LIGHT);

    world.addIntent(USER, INTENT_A);

    return context;
  }

  it('영수증 제출 — 자기 결제 의도로 결제한 거래면 받아들이고 구독 행을 넘겨받는다', async () => {
    const { world, purchase } = await setupExpiredOwnedByOther();

    await purchase(signTransaction(REPURCHASE), USER, AFTER_EXPIRY);

    expect(world.subscriptions).toEqual([
      expect.objectContaining({
        userId: USER,
        status: SubscriptionStatus.ACTIVE,
        expiresAt: REPURCHASE.expiresAt,
      }),
    ]);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect(world.users.get(OTHER)!.tier).toBe(UserTier.LIGHT);
  });

  it('알림이 먼저 와도 결제한 계정이 유료가 된다 — 예전 계정이 아니다', async () => {
    const { world, purchase, notify } = await setupExpiredOwnedByOther();

    await notify(
      { id: 'n-resubscribed', type: 'SUBSCRIBED', transaction: REPURCHASE },
      AFTER_EXPIRY,
    );

    expect(world.subscriptions[0].userId).toBe(USER);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect(world.users.get(OTHER)!.tier).toBe(UserTier.LIGHT);

    // 뒤이은 영수증 제출도 성공한다(409가 아니다)
    await purchase(signTransaction(REPURCHASE), USER, AFTER_EXPIRY);
    expect(world.subscriptions).toHaveLength(1);
  });

  it.each([
    ['결제 의도 없이 결제된 거래', null],
    ['예전 계정의 결제 의도로 결제된 거래', INTENT_B],
  ])('%s면 끝난 구독이어도 넘겨받지 못한다', async (_label, accountToken) => {
    const { world, purchase } = await setupExpiredOwnedByOther();

    await expectBusinessError(
      purchase(
        signTransaction({ ...REPURCHASE, accountToken }),
        USER,
        AFTER_EXPIRY,
      ),
      ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
      HttpStatus.CONFLICT,
    );
    expect(world.subscriptions[0].userId).toBe(OTHER);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('넘겨받기가 거절된 알림(끝난 채로 남는 반영)은 새 계정의 결제 의도를 확인된 것으로 찍지 않는다', async () => {
    const { world, notify } = await setupExpiredOwnedByOther();

    // USER 의 토큰이 실린 만료 알림 — 구독을 되살리지 않으므로 행은 OTHER 의 것 그대로다
    await notify(
      {
        id: 'n-expired-again',
        type: 'EXPIRED',
        transaction: { ...REPURCHASE, accountToken: INTENT_A },
      },
      AFTER_EXPIRY,
    );

    expect(world.subscriptions[0].userId).toBe(OTHER);
    expect(world.intents.find((intent) => intent.id === INTENT_A)!.status).toBe(
      PurchaseIntentStatus.CREATED,
    );
  });

  it('결제한 계정이 탈퇴해 의도가 없는 알림은 예전 주인에게 반영하지 않고 주인 모름으로 둔다(2026-10-07)', async () => {
    const { world, notify } = await setupExpiredOwnedByOther();

    world.withdraw(USER); // INTENT_A 가 파기된다

    await notify(
      { id: 'n-resubscribed', type: 'SUBSCRIBED', transaction: REPURCHASE },
      AFTER_EXPIRY,
    );

    expect(world.subscriptions[0]).toMatchObject({
      userId: OTHER,
      status: SubscriptionStatus.EXPIRED,
    });
    expect(world.users.get(OTHER)!.tier).toBe(UserTier.LIGHT);
    // 처리 완료로 표시하지 않는다 — 재가입 뒤 영수증 제출·복원이 연결한다
    expect(world.notificationLogs.at(-1)!.processedAt).toBeNull();
  });

  it('예전 계정의 것으로 다시 결제된 알림은 예전 계정에 반영한다', async () => {
    const { world, notify } = await setupExpiredOwnedByOther();

    await notify(
      {
        id: 'n-resubscribed',
        type: 'SUBSCRIBED',
        transaction: { ...REPURCHASE, accountToken: INTENT_B },
      },
      AFTER_EXPIRY,
    );

    expect(world.subscriptions[0].userId).toBe(OTHER);
    expect(world.users.get(OTHER)!.tier).toBe(UserTier.PRO);
  });
});

describe('처음 연결하는 구독은 Apple에 지금 상태를 묻는다(4.4-5 — 2026-10-06)', () => {
  const restore = (
    orchestrator: BillingOrchestrator,
    signedTransactions: string[],
  ) =>
    orchestrator.restorePurchases({
      userId: USER,
      platform: DevicePlatform.IOS,
      signedTransactions,
      purchaseTokens: [],
      now: NOW,
    });

  const REVOKED = {
    status: 'revoked' as const,
    transaction: buildTransaction({ ...THIS_PERIOD, revokedAt: NOW }),
    renewal: null,
  };

  it('환불 → 탈퇴 → 재가입 뒤 환불 전 서명 거래를 내면 받지 않는다(구독 행이 없어도 Apple이 환불이라 답한다)', async () => {
    const { world, purchase, notify } = setup();

    await purchase(signTransaction(THIS_PERIOD), OTHER);
    await notify({
      id: 'n-refund',
      type: 'REFUND',
      transaction: { ...THIS_PERIOD, revokedAt: NOW },
    });
    world.withdraw(OTHER);
    expect(world.subscriptions).toHaveLength(0);
    world.gateway.statuses.set('otx-1', REVOKED);

    await expectBusinessError(
      purchase(signTransaction(THIS_PERIOD), USER),
      ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
    expect(world.subscriptions).toHaveLength(0);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it.each(['expired', 'billing_retry'] as const)(
    'Apple이 %s라 답한 구독의 거래도 받지 않는다',
    async (status) => {
      const { world, purchase } = setup();

      world.gateway.statuses.set('otx-1', {
        status,
        transaction: buildTransaction(THIS_PERIOD),
        renewal: null,
      });

      await expectBusinessError(
        purchase(signTransaction(THIS_PERIOD)),
        ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
        HttpStatus.BAD_REQUEST,
      );
      expect(world.subscriptions).toHaveLength(0);
    },
  );

  it('Apple이 유효라 답하면 그 상태로 연결한다 — 연결 전에 한 해지 예약이 빠지지 않는다', async () => {
    const { world, orchestrator, purchase } = setup();

    world.gateway.statuses.set('otx-1', {
      status: 'active',
      transaction: buildTransaction(THIS_PERIOD),
      renewal: {
        isAutoRenew: false,
        autoRenewProductId: PRODUCT_PRO,
        gracePeriodExpiresAt: null,
      },
    });

    await purchase(signTransaction(THIS_PERIOD));

    expect(world.subscriptions[0]).toMatchObject({
      userId: USER,
      status: SubscriptionStatus.CANCELLED,
      isAutoRenew: false,
      expiresAt: THIS_PERIOD.expiresAt,
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect((await orchestrator.getSubscription(USER, NOW)).plan.status).toBe(
      PlanStatus.CANCEL_SCHEDULED,
    );
  });

  it.each([
    [
      'Apple에 물을 수 없으면(키 미구성)',
      (world: BillingTestWorld) => {
        world.gateway.statusQueryable = false;
      },
    ],
    [
      '상태 조회가 실패하면',
      (world: BillingTestWorld) => {
        world.gateway.fetchStatusError = new AppStoreVerificationError(
          'unavailable',
          'fake',
        );
      },
    ],
    ['Apple이 그 구독을 모르면', () => undefined],
  ])('%s 결제를 막지 않고 거래만으로 연결한다', async (_label, arrange) => {
    const { world, purchase } = setup();

    arrange(world);
    await purchase(signTransaction(THIS_PERIOD));

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it('Apple의 답이 제출된 거래보다 옛것이면(방금 한 재구독을 아직 모른다) 그 답으로 거절하지 않는다', async () => {
    const { world, purchase } = setup();

    // Apple은 지난 주기에서 만료됐다고 답하는데, 손에 든 것은 그 뒤에 결제된 다음 주기의 서명 거래다
    world.gateway.statuses.set('otx-1', {
      status: 'expired',
      transaction: buildTransaction(THIS_PERIOD),
      renewal: null,
    });

    await purchase(
      signTransaction(NEXT_PERIOD),
      USER,
      new Date('2026-11-01T00:01:00Z'),
    );

    expect(world.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      expiresAt: NEXT_PERIOD.expiresAt,
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it('상태 조회가 예상 밖의 오류로 죽어도 결제를 막지 않는다', async () => {
    const { world, purchase } = setup();

    jest
      .spyOn(world.gateway, 'fetchStatus')
      .mockRejectedValue(new Error('socket hang up'));

    await purchase(signTransaction(THIS_PERIOD));

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it('Apple 답의 거래가 제출된 거래와 다른 계정 토큰이면 그 답으로 반영하지 않고 거래로 연결한다 — 주인 확인은 제출 거래로 했다', async () => {
    const { world, purchase } = setup();

    world.addIntent(USER, INTENT_A);
    world.addIntent(OTHER, INTENT_B);
    // Apple 은 유효(해지 예약)라 답하지만 그 거래에는 다른 계정의 토큰이 실려 있다
    world.gateway.statuses.set('otx-1', {
      status: 'active',
      transaction: buildTransaction({ ...THIS_PERIOD, accountToken: INTENT_B }),
      renewal: {
        isAutoRenew: false,
        autoRenewProductId: PRODUCT_PRO,
        gracePeriodExpiresAt: null,
      },
    });

    await purchase(signTransaction({ ...THIS_PERIOD, accountToken: INTENT_A }));

    // 스냅샷(해지 예약)이 아니라 제출 거래(자동 갱신)로 연결됐다
    expect(world.subscriptions[0]).toMatchObject({
      userId: USER,
      status: SubscriptionStatus.ACTIVE,
      isAutoRenew: true,
    });
    expect(world.intents.find((intent) => intent.id === INTENT_A)!.status).toBe(
      PurchaseIntentStatus.VERIFIED,
    );
  });

  it('이미 연결된 살아 있는 구독은 다시 묻지 않는다 — 환불·해지는 알림으로 들어온다', async () => {
    const { world, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    world.gateway.statuses.set('otx-1', REVOKED);

    await purchase(signTransaction(THIS_PERIOD));

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('복원 — Apple이 끝났다고 답한 구독은 오류가 아니라 복원하지 않는다', async () => {
    const { world, orchestrator } = setup();

    world.gateway.statuses.set('otx-1', REVOKED);

    const result = await restore(orchestrator, [signTransaction(THIS_PERIOD)]);

    expect(result.restored).toBe(false);
    expect(world.subscriptions).toHaveLength(0);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('복원 — Apple이 유예라 답하면 유예로 연결한다', async () => {
    const { world, orchestrator } = setup();
    const graceEnd = new Date('2026-11-17T00:00:00Z');

    world.gateway.statuses.set('otx-1', {
      status: 'grace',
      transaction: buildTransaction(THIS_PERIOD),
      renewal: {
        isAutoRenew: true,
        autoRenewProductId: PRODUCT_PRO,
        gracePeriodExpiresAt: graceEnd,
      },
    });

    const result = await restore(orchestrator, [signTransaction(THIS_PERIOD)]);

    expect(result.restored).toBe(true);
    expect(world.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.GRACE,
      expiresAt: graceEnd,
    });
  });
});

describe('만료 보정의 상한 — 확인할 수 없는 구독(4.2 — 2026-10-06)', () => {
  const WITHIN_LIMIT = new Date('2026-11-07T23:00:00Z');
  const PAST_LIMIT = new Date('2026-11-08T01:00:00Z');

  const UNVERIFIABLE: [string, (world: BillingTestWorld) => void][] = [
    [
      '스토어에 물을 수 없는(키 미구성)',
      (world) => {
        world.gateway.statusQueryable = false;
      },
    ],
    [
      '스토어 조회가 계속 실패하는',
      (world) => {
        world.gateway.fetchStatusError = new AppStoreVerificationError(
          'unavailable',
          'fake',
        );
      },
    ],
    ['스토어가 모르는', () => undefined],
  ];

  it.each(UNVERIFIABLE)(
    '%s 구독도 만료일이 7일을 넘기면 만료로 내린다',
    async (_label, arrange) => {
      const { world, orchestrator, purchase } = setup();

      await purchase(signTransaction(THIS_PERIOD));
      arrange(world);

      const view = await orchestrator.getSubscription(USER, PAST_LIMIT);

      expect(view.plan.status).toBe(PlanStatus.FREE);
      expect(world.subscriptions[0]).toMatchObject({
        status: SubscriptionStatus.EXPIRED,
        isAutoRenew: false,
        // 스토어가 말한 사실이 아니다 — 알림 순서 기준 시각을 건드리지 않는다
        lastNotifiedAt: null,
      });
      expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
    },
  );

  it('7일 안에는 종전대로 그대로 둔다', async () => {
    const { world, orchestrator, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    world.gateway.statusQueryable = false;

    await orchestrator.getSubscription(USER, WITHIN_LIMIT);

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it('상한으로 내리면 Slack 결제 알림 채널에 한 줄 올린다 — 잦으면 조회 구성 문제다', async () => {
    const { world, orchestrator, purchase, slackTexts } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    world.gateway.statusQueryable = false;

    await orchestrator.getSubscription(USER, PAST_LIMIT);

    expect(slackTexts.some((text) => text.includes('구독 강제 만료'))).toBe(
      true,
    );
    expect(slackTexts.join('\n')).not.toContain(USER);
  });

  it('배치도 같은 상한을 적용하고 내린 건수에 센다', async () => {
    const { world, reconcile, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    world.gateway.statusQueryable = false;

    expect(await reconcile.reconcileOverdue(WITHIN_LIMIT)).toBe(0);
    expect(await reconcile.reconcileOverdue(PAST_LIMIT)).toBe(1);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
    // 내려간 행은 보정 대상에서 빠진다 — 배치의 앞자리를 계속 차지하지 않는다
    expect(await reconcile.reconcileOverdue(PAST_LIMIT)).toBe(0);
  });

  it('상한으로 내린 뒤 늦게 도착한 갱신 거래는 구독을 되살린다', async () => {
    const { world, orchestrator, purchase } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    world.gateway.statusQueryable = false;
    await orchestrator.getSubscription(USER, PAST_LIMIT);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);

    await purchase(signTransaction(NEXT_PERIOD), USER, PAST_LIMIT);

    expect(world.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      expiresAt: NEXT_PERIOD.expiresAt,
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it('상한으로 내린 뒤 늦게 도착한 갱신 알림도 구독을 되살린다', async () => {
    const { world, orchestrator, purchase, notify } = setup();

    await purchase(signTransaction(THIS_PERIOD));
    world.gateway.statusQueryable = false;
    await orchestrator.getSubscription(USER, PAST_LIMIT);

    await notify(
      { id: 'n-late-renew', type: 'DID_RENEW', transaction: NEXT_PERIOD },
      PAST_LIMIT,
    );

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });
});
