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

import { PlanAction } from './billing.enum';
import {
  PlayNotification,
  PlayStoreError,
} from './play-store/play-store.gateway';
import { assembleBilling } from './testing/billing-test-harness';
import {
  FAKE_PLAY_PUSH_TOKEN,
  PLAY_PRODUCT_DAILY,
  PLAY_PRODUCT_PRO,
  playPushBody,
  signTransaction,
} from './testing/billing-test-world';

/**
 * Google Play 결제 흐름(`subscription-api.md` 4.4·4.5·4.7) — 가짜 Google 위에서 실제 서비스 코드를 돌린다.
 * "스토어에서 상태가 바뀌었다"는 가짜 Google의 구매 값을 바꾸는 것으로 표현한다.
 */
const USER = 'user-a';
const OTHER = 'user-b';
const INTENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INTENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const NOW = new Date('2026-10-10T00:00:00Z');
const EXPIRES_AT = new Date('2026-11-01T00:00:00Z');
const NEXT_EXPIRES_AT = new Date('2026-12-01T00:00:00Z');

function setup() {
  const billing = assembleBilling();
  const { world, orchestrator, playStoreWebhook } = billing;

  world.enablePlay();
  world.addUser(USER);
  world.addUser(OTHER);

  const submit = (purchaseToken: string, userId = USER, now = NOW) =>
    orchestrator.submitPurchase({
      userId,
      platform: DevicePlatform.ANDROID,
      signedTransaction: null,
      purchaseToken,
      now,
    });

  const restore = (purchaseTokens: string[], userId = USER) =>
    orchestrator.restorePurchases({
      userId,
      platform: DevicePlatform.ANDROID,
      signedTransactions: [],
      purchaseTokens,
      now: NOW,
    });

  const notify = (
    messageId: string,
    notification: Partial<PlayNotification>,
    now = NOW,
    authorization = `Bearer ${FAKE_PLAY_PUSH_TOKEN}`,
  ) =>
    playStoreWebhook.handle(
      authorization,
      playPushBody(messageId, { kind: 'subscription', ...notification }),
      now,
    );

  return { ...billing, play: world.playGateway, submit, restore, notify };
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
  for (const level of ['log', 'warn'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }
});

describe('Play — 요금제·결제 의도', () => {
  it('Play 상품이 있고 검증이 켜져 있으면 Android에서도 구독하기가 나온다', async () => {
    const { orchestrator } = setup();

    const catalog = await orchestrator.listPlans(USER, DevicePlatform.ANDROID);

    expect(
      catalog.plans.map((plan) => [
        plan.tier,
        plan.storeProductId,
        plan.action,
      ]),
    ).toEqual([
      [UserTier.LIGHT, null, PlanAction.CURRENT],
      [UserTier.DAILY, PLAY_PRODUCT_DAILY, PlanAction.PURCHASE],
      [UserTier.PRO, PLAY_PRODUCT_PRO, PlanAction.PURCHASE],
    ]);
  });

  it('결제 의도는 Play 상품 ID를 돌려준다', async () => {
    const { orchestrator } = setup();

    await expect(
      orchestrator.createPurchaseIntent({
        userId: USER,
        planId: 'plan-pro',
        platform: DevicePlatform.ANDROID,
        entryPoint: null,
      }),
    ).resolves.toMatchObject({ storeProductId: PLAY_PRODUCT_PRO });
  });

  it('App Store에서 구독 중인 계정은 Android에서 결제를 시작할 수 없다(이중 결제 방지)', async () => {
    const { world, orchestrator } = setup();

    await orchestrator.submitPurchase({
      userId: USER,
      platform: DevicePlatform.IOS,
      signedTransaction: signTransaction({ expiresAt: EXPIRES_AT }),
      purchaseToken: null,
      now: NOW,
    });
    expect(world.subscriptions[0].store).toBe(SubscriptionStore.APP_STORE);

    await expectBusinessError(
      orchestrator.createPurchaseIntent({
        userId: USER,
        planId: 'plan-pro',
        platform: DevicePlatform.ANDROID,
        entryPoint: null,
      }),
      ErrorCode.SUBSCRIPTION_STORE_MISMATCH,
      HttpStatus.CONFLICT,
    );
  });
});

describe('Play — 영수증 제출(4.4)', () => {
  it('Google이 유효하다고 답한 구매면 구독·티어를 반영하고, 그 뒤에 구매를 확인(acknowledge)한다', async () => {
    const { world, play, submit } = setup();

    world.addIntent(USER, INTENT_A);
    play.put({ purchaseToken: 'token-1', accountToken: INTENT_A });

    const view = await submit('token-1');

    expect(world.subscriptions).toEqual([
      expect.objectContaining({
        userId: USER,
        tier: UserTier.PRO,
        status: SubscriptionStatus.ACTIVE,
        isAutoRenew: true,
        store: SubscriptionStore.PLAY_STORE,
        environment: SubscriptionEnvironment.SANDBOX,
        // Play에는 원거래 ID가 없다 — 그 구독의 최초 구매 토큰이 키다
        originalTransactionId: 'token-1',
        latestReceipt: 'token-1',
        expiresAt: EXPIRES_AT,
      }),
    ]);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect(world.intents[0].status).toBe(PurchaseIntentStatus.VERIFIED);
    expect(play.acknowledged).toEqual(['token-1']);
    expect(view).toMatchObject({
      plan: { status: PlanStatus.SUBSCRIBED, tier: UserTier.PRO },
      entitlements: { dailyPlayLimit: null },
      store: SubscriptionStore.PLAY_STORE,
    });
  });

  it('같은 토큰을 다시 보내도 같은 결과이고, 이미 확인한 구매는 다시 확인하지 않는다', async () => {
    const { world, play, submit } = setup();

    play.put({ purchaseToken: 'token-1' });
    const first = await submit('token-1');
    const second = await submit('token-1');

    expect(second).toEqual(first);
    expect(world.subscriptions).toHaveLength(1);
    expect(play.acknowledged).toEqual(['token-1']);
  });

  it('클라이언트가 아니라 Google이 답한 상품으로 티어를 정한다', async () => {
    const { world, play, submit } = setup();

    play.put({ purchaseToken: 'token-1', productId: PLAY_PRODUCT_DAILY });
    await submit('token-1');

    expect(world.users.get(USER)!.tier).toBe(UserTier.DAILY);
  });

  it.each([
    ['Google이 모르는 토큰', null],
    ['결제 대기 중인 구매', { state: 'pending' as const }],
    ['만료된 구매', { state: 'expired' as const }],
    ['결제 보류 중인 구매', { state: 'on_hold' as const }],
    ['우리 요금제가 아닌 상품', { productId: 'someone_elses_product' }],
  ])(
    '%s 는 받지 않고 아무것도 쓰지 않으며 확인하지도 않는다',
    async (_label, purchase) => {
      const { world, play, submit, slackTexts } = setup();

      if (purchase !== null) {
        play.put({ purchaseToken: 'token-1', ...purchase });
      }

      const error = await expectBusinessError(
        submit('token-1'),
        ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
        HttpStatus.BAD_REQUEST,
      );

      expect(error.retryable).toBe(false);
      expect(world.subscriptions).toHaveLength(0);
      // 거부는 사람이 봐야 한다 — Slack 한 줄(runbook 4-1). 토큰·사용자 식별자는 싣지 않는다
      expect(slackTexts).toEqual([
        expect.stringContaining('결제 검증 거부 · Google Play'),
      ]);
      expect(slackTexts[0]).not.toContain('token-1');
      expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
      expect(play.acknowledged).toHaveLength(0);
    },
  );

  it('Google 조회가 일시적으로 실패하면 재시도 가능한 503이다', async () => {
    const { world, play, submit } = setup();

    play.put({ purchaseToken: 'token-1' });
    play.fetchError = new PlayStoreError('unavailable', 'fake');

    const error = await expectBusinessError(
      submit('token-1'),
      ErrorCode.SUBSCRIPTION_STORE_UNAVAILABLE,
      HttpStatus.SERVICE_UNAVAILABLE,
    );

    expect(error.retryable).toBe(true);
    expect(world.subscriptions).toHaveLength(0);
  });

  it('반영은 됐는데 확인(acknowledge)이 실패하면 503으로 답해 다시 제출하게 하고, 재제출이 확인을 마친다', async () => {
    const { world, play, submit } = setup();

    play.put({ purchaseToken: 'token-1' });
    play.acknowledgeError = new PlayStoreError('unavailable', 'fake');

    await expectBusinessError(
      submit('token-1'),
      ErrorCode.SUBSCRIPTION_STORE_UNAVAILABLE,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    // 결제한 사용자는 이미 유료다 — 확인만 남았다
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect(play.acknowledged).toHaveLength(0);

    play.acknowledgeError = null;
    await submit('token-1');

    expect(play.acknowledged).toEqual(['token-1']);
    expect(world.subscriptions).toHaveLength(1);
  });

  it('다른 계정에 연결된 구매는 받지 않는다', async () => {
    const { world, play, submit } = setup();

    play.put({ purchaseToken: 'token-1' });
    await submit('token-1', OTHER);

    await expectBusinessError(
      submit('token-1', USER),
      ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
      HttpStatus.CONFLICT,
    );
    expect(world.subscriptions[0].userId).toBe(OTHER);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('남이 시작한 결제의 토큰을 주워 제출하면 받지 않고, 그 구매를 확인하지도 않는다', async () => {
    const { world, play, submit } = setup();

    world.addIntent(OTHER, INTENT_B);
    play.put({ purchaseToken: 'token-1', accountToken: INTENT_B });

    await expectBusinessError(
      submit('token-1', USER),
      ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
      HttpStatus.CONFLICT,
    );
    expect(world.subscriptions).toHaveLength(0);
    expect(play.acknowledged).toHaveLength(0);
  });

  it('업그레이드로 새 토큰이 발급되면 같은 구독 행을 갱신한다 — 행이 늘지 않는다', async () => {
    const { world, play, submit } = setup();

    play.put({ purchaseToken: 'token-1', productId: PLAY_PRODUCT_DAILY });
    await submit('token-1');

    // Play는 업그레이드 때 새 토큰을 내고, 응답에 이전 토큰을 적어 준다
    play.put({
      purchaseToken: 'token-2',
      linkedPurchaseToken: 'token-1',
      productId: PLAY_PRODUCT_PRO,
      expiresAt: new Date('2026-11-10T00:00:00Z'),
    });
    await submit('token-2');

    expect(world.subscriptions).toEqual([
      expect.objectContaining({
        originalTransactionId: 'token-1',
        latestReceipt: 'token-2',
        tier: UserTier.PRO,
      }),
    ]);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);

    // 한 번 더 바뀌어도(이전 토큰이 최초 토큰이 아니어도) 같은 행을 찾는다
    play.put({
      purchaseToken: 'token-3',
      linkedPurchaseToken: 'token-2',
      productId: PLAY_PRODUCT_DAILY,
      expiresAt: NEXT_EXPIRES_AT,
    });
    await submit('token-3');

    expect(world.subscriptions).toHaveLength(1);
    expect(world.subscriptions[0]).toMatchObject({
      originalTransactionId: 'token-1',
      latestReceipt: 'token-3',
      tier: UserTier.DAILY,
    });
  });

  it('Android 검증 구성이 없는 서버는 구독할 수 없음으로 답한다', async () => {
    const { play, submit } = setup();

    play.put({ purchaseToken: 'token-1' });
    play.enabled = false;

    await expectBusinessError(
      submit('token-1'),
      ErrorCode.SUBSCRIPTION_PLAN_UNAVAILABLE,
      HttpStatus.BAD_REQUEST,
    );
  });
});

describe('Play — 구매 복원(4.5)', () => {
  it('보낼 구매가 없으면 "복원할 구독 없음"이다', async () => {
    const { restore } = setup();

    expect((await restore([])).restored).toBe(false);
  });

  it('유효한 구매를 연결하고 확인까지 한다', async () => {
    const { world, play, restore } = setup();

    play.put({ purchaseToken: 'token-1', productId: PLAY_PRODUCT_DAILY });

    const result = await restore(['token-1']);

    expect(result.restored).toBe(true);
    expect(result.subscription.plan.tier).toBe(UserTier.DAILY);
    expect(world.users.get(USER)!.tier).toBe(UserTier.DAILY);
    expect(play.acknowledged).toEqual(['token-1']);
  });

  it('만료·보류된 구매는 오류가 아니라 무시한다', async () => {
    const { world, play, restore } = setup();

    play.put({ purchaseToken: 'token-1', state: 'expired' });
    play.put({ purchaseToken: 'token-2', state: 'on_hold' });

    const result = await restore(['token-1', 'token-2']);

    expect(result.restored).toBe(false);
    expect(world.subscriptions).toHaveLength(0);
    expect(play.acknowledged).toHaveLength(0);
  });

  it('다른 계정의 구매가 하나라도 섞이면 요청 전체를 거부하고 아무것도 반영하지 않는다', async () => {
    const { world, play, restore, submit } = setup();

    play.put({ purchaseToken: 'token-other' });
    await submit('token-other', OTHER);
    play.put({ purchaseToken: 'token-mine' });

    await expectBusinessError(
      restore(['token-mine', 'token-other']),
      ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
      HttpStatus.CONFLICT,
    );

    expect(world.subscriptions.map((row) => row.originalTransactionId)).toEqual(
      ['token-other'],
    );
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
    expect(play.acknowledged).toEqual(['token-other']);
  });

  it('Google이 모르는 토큰이 섞이면 요청 전체가 오류다', async () => {
    const { world, play, restore } = setup();

    play.put({ purchaseToken: 'token-1' });

    await expectBusinessError(
      restore(['token-1', 'made-up-token']),
      ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
    expect(world.subscriptions).toHaveLength(0);
  });
});

describe('Play — 실시간 알림(4.7)', () => {
  it('해지 알림 — 현재 상태를 조회해 해지 예약으로 반영한다. 만료일까지 유효하다', async () => {
    const { world, orchestrator, play, submit, notify } = setup();

    const purchase = play.put({ purchaseToken: 'token-1' });
    await submit('token-1');

    // 사용자가 Play에서 해지했다 — Google의 현재 상태가 바뀌고 알림(유형 3)이 온다
    purchase.state = 'canceled';
    await notify('msg-1', { type: 3, purchaseToken: 'token-1' });

    expect(world.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.CANCELLED,
      isAutoRenew: false,
      expiresAt: EXPIRES_AT,
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect((await orchestrator.getSubscription(USER, NOW)).plan.status).toBe(
      PlanStatus.CANCEL_SCHEDULED,
    );
    expect(world.notificationLogs).toEqual([
      expect.objectContaining({
        store: SubscriptionStore.PLAY_STORE,
        notificationId: 'msg-1',
        type: 'SUBSCRIPTION:3',
        processedAt: NOW,
      }),
    ]);
    // 구매 토큰 원문은 적재하지 않는다 — 해시만
    expect(JSON.stringify(world.notificationLogs[0].payload)).not.toContain(
      'token-1',
    );
  });

  it('갱신 알림 — 만료일이 늘어난다', async () => {
    const { world, play, submit, notify } = setup();

    const purchase = play.put({ purchaseToken: 'token-1' });
    await submit('token-1');

    purchase.expiresAt = NEXT_EXPIRES_AT;
    await notify('msg-1', { type: 2, purchaseToken: 'token-1' });

    expect(world.subscriptions[0].expiresAt).toEqual(NEXT_EXPIRES_AT);
  });

  it('만료 알림 — 사용자 티어가 무료로 내려간다', async () => {
    const { world, play, submit, notify } = setup();

    const purchase = play.put({ purchaseToken: 'token-1' });
    await submit('token-1');

    purchase.state = 'expired';
    await notify('msg-1', { type: 13, purchaseToken: 'token-1' });

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.EXPIRED);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it.each([
    ['철회 알림(유형 12)', { kind: 'subscription' as const, type: 12 }],
    ['환불 통지(voided)', { kind: 'voided' as const, type: null }],
  ])(
    '%s — Google이 아직 활성이라 답해도 즉시 환불로 내린다',
    async (_label, notification) => {
      const { world, play, submit, notify } = setup();

      play.put({ purchaseToken: 'token-1' });
      await submit('token-1');

      await notify('msg-1', { ...notification, purchaseToken: 'token-1' });

      expect(world.subscriptions[0].status).toBe(SubscriptionStatus.REFUNDED);
      expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
    },
  );

  it('유예 알림 — 혜택을 유지하고 결제 문제를 표시한다', async () => {
    const { world, orchestrator, play, submit, notify } = setup();

    const purchase = play.put({ purchaseToken: 'token-1' });
    await submit('token-1');

    purchase.state = 'grace';
    await notify('msg-1', { type: 6, purchaseToken: 'token-1' });

    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect((await orchestrator.getSubscription(USER, NOW)).plan).toMatchObject({
      status: PlanStatus.GRACE,
      hasPaymentIssue: true,
    });
  });

  it('영수증 제출보다 알림이 먼저 오면 계정 토큰으로 구독을 만들고 구매를 확인한다', async () => {
    const { world, play, notify } = setup();

    world.addIntent(USER, INTENT_A);
    play.put({ purchaseToken: 'token-1', accountToken: INTENT_A });

    await notify('msg-1', { type: 4, purchaseToken: 'token-1' });

    expect(world.subscriptions).toEqual([
      expect.objectContaining({ userId: USER, tier: UserTier.PRO }),
    ]);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect(world.intents[0].status).toBe(PurchaseIntentStatus.VERIFIED);
    expect(play.acknowledged).toEqual(['token-1']);
  });

  it('주인을 모르는 구매의 알림은 받아 두되 완료로 두지 않고, 그 구매를 확인하지도 않는다', async () => {
    const { world, play, submit, notify } = setup();

    play.put({ purchaseToken: 'token-1' });
    await notify('msg-1', { type: 4, purchaseToken: 'token-1' });

    expect(world.subscriptions).toHaveLength(0);
    expect(world.notificationLogs[0].processedAt).toBeNull();
    expect(play.acknowledged).toHaveLength(0);

    // 이후 영수증 제출이 연결하고 확인한다
    await submit('token-1');
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
    expect(play.acknowledged).toEqual(['token-1']);
  });

  it('구매 확인이 실패하면 5xx로 답하고 완료로 두지 않는다 — 재전송된 알림이 확인을 마친다', async () => {
    const { world, play, notify } = setup();

    world.addIntent(USER, INTENT_A);
    play.put({ purchaseToken: 'token-1', accountToken: INTENT_A });
    play.acknowledgeError = new PlayStoreError('unavailable', 'fake');

    await expectBusinessError(
      notify('msg-1', { type: 4, purchaseToken: 'token-1' }),
      ErrorCode.SUBSCRIPTION_STORE_UNAVAILABLE,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(world.notificationLogs[0].processedAt).toBeNull();

    // Pub/Sub이 같은 메시지를 다시 보낸다
    play.acknowledgeError = null;
    await notify('msg-1', { type: 4, purchaseToken: 'token-1' });

    expect(play.acknowledged).toEqual(['token-1']);
    expect(world.notificationLogs).toHaveLength(1);
    expect(world.notificationLogs[0].processedAt).toEqual(NOW);
    expect(world.subscriptions).toHaveLength(1);
  });

  it('이미 처리한 알림의 재전송은 Google을 다시 조회하지 않는다', async () => {
    const { world, play, submit, notify } = setup();

    const purchase = play.put({ purchaseToken: 'token-1' });
    await submit('token-1');
    purchase.state = 'expired';
    await notify('msg-1', { type: 13, purchaseToken: 'token-1' });

    // 그 사이 다시 살아났다고 치자 — 같은 메시지가 또 와도 상태를 건드리지 않는다
    world.subscriptions[0].status = SubscriptionStatus.ACTIVE;
    play.fetchError = new PlayStoreError('unavailable', 'should not be called');
    await notify('msg-1', { type: 13, purchaseToken: 'token-1' });

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('테스트 알림과 Google이 모르는 토큰의 알림은 적재하고 완료로 끝낸다', async () => {
    const { world, notify } = setup();

    await notify('msg-test', { kind: 'test', purchaseToken: null });
    await notify('msg-gone', { type: 13, purchaseToken: 'long-gone-token' });

    expect(
      world.notificationLogs.map((log) => [log.type, log.processedAt]),
    ).toEqual([
      ['TEST', NOW],
      ['SUBSCRIPTION:13', NOW],
    ]);
  });

  it('보낸 쪽을 확인할 수 없는 요청은 400이고 적재하지 않는다', async () => {
    const { world, play, notify } = setup();

    play.put({ purchaseToken: 'token-1' });

    await expectBusinessError(
      notify(
        'msg-1',
        { type: 4, purchaseToken: 'token-1' },
        NOW,
        'Bearer forged',
      ),
      ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
    expect(world.notificationLogs).toHaveLength(0);
  });

  it('Pub/Sub 봉투 모양이 아닌 본문은 검증 오류다', async () => {
    const { playStoreWebhook } = setup();

    for (const body of [
      null,
      {},
      { message: {} },
      { message: { data: 'x' } },
    ]) {
      await expectBusinessError(
        playStoreWebhook.handle(`Bearer ${FAKE_PLAY_PUSH_TOKEN}`, body, NOW),
        ErrorCode.VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
      );
    }
  });

  it('Pub/Sub이 snake_case로 보낸 메시지 ID(message_id)도 받는다', async () => {
    const { world, playStoreWebhook } = setup();
    const body = playPushBody('ignored', { kind: 'test', purchaseToken: null });

    await playStoreWebhook.handle(
      `Bearer ${FAKE_PLAY_PUSH_TOKEN}`,
      { message: { data: body.message.data, message_id: 'snake-1' } },
      NOW,
    );

    expect(world.notificationLogs[0].notificationId).toBe('snake-1');
  });
});

describe('Play — 만료 보정(4.2)', () => {
  const AFTER_EXPIRY = new Date('2026-11-01T02:00:00Z');

  it('알림이 유실돼 만료일이 지난 채 유효로 남은 구독을 Google의 현재 상태로 맞춘다', async () => {
    const { world, orchestrator, play, submit } = setup();

    const purchase = play.put({ purchaseToken: 'token-1' });
    await submit('token-1');
    purchase.state = 'expired';

    const view = await orchestrator.getSubscription(USER, AFTER_EXPIRY);

    expect(view.plan.status).toBe(PlanStatus.FREE);
    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.EXPIRED);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('갱신 알림만 유실됐으면(Google은 활성) 만료일을 늘리고 유료를 유지한다', async () => {
    const { world, orchestrator, play, submit } = setup();

    const purchase = play.put({ purchaseToken: 'token-1' });
    await submit('token-1');
    purchase.expiresAt = NEXT_EXPIRES_AT;

    const view = await orchestrator.getSubscription(USER, AFTER_EXPIRY);

    expect(view.plan).toMatchObject({
      status: PlanStatus.SUBSCRIBED,
      renewsAt: NEXT_EXPIRES_AT,
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it.each([
    [
      'Android 검증이 꺼져 있으면',
      (play: ReturnType<typeof setup>['play']) => {
        play.enabled = false;
      },
    ],
    [
      'Google 조회가 실패하면',
      (play: ReturnType<typeof setup>['play']) => {
        play.fetchError = new PlayStoreError('unavailable', 'fake');
      },
    ],
    [
      'Google이 그 토큰을 모르면',
      (play: ReturnType<typeof setup>['play']) => {
        play.purchases.clear();
      },
    ],
  ])(
    '%s 추측으로 강등하지 않고 저장된 상태 그대로 응답한다',
    async (_label, arrange) => {
      const { world, orchestrator, play, submit } = setup();

      play.put({ purchaseToken: 'token-1' });
      await submit('token-1');
      arrange(play);

      const view = await orchestrator.getSubscription(USER, AFTER_EXPIRY);

      expect(view.plan.tier).toBe(UserTier.PRO);
      expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
    },
  );

  it('배치는 App Store·Play 구독을 함께 보정한다', async () => {
    const { world, orchestrator, reconcile, play, submit } = setup();

    const purchase = play.put({ purchaseToken: 'token-1' });
    await submit('token-1');
    purchase.state = 'expired';
    await orchestrator.submitPurchase({
      userId: OTHER,
      platform: DevicePlatform.IOS,
      signedTransaction: signTransaction({
        originalTransactionId: 'otx-ios',
        expiresAt: EXPIRES_AT,
      }),
      purchaseToken: null,
      now: NOW,
    });
    // App Store 쪽은 스토어가 모른다고 답한다(가짜 기본값) → 그대로 둔다

    expect(await reconcile.reconcileOverdue(AFTER_EXPIRY)).toBe(1);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
    expect(world.users.get(OTHER)!.tier).toBe(UserTier.PRO);
  });
});

describe('Play — 환불로 끝난 구독은 같은 구매로 되살아나지 않는다(4.7 — 2026-10-06)', () => {
  /** 구독 중에 환불 통지를 받은 상태. Google은 그 토큰을 여전히 활성이라 답한다 */
  async function setupRefunded() {
    const context = setup();
    const { world, play, submit, notify } = context;

    const purchase = play.put({ purchaseToken: 'token-1' });
    await submit('token-1');
    await notify('msg-voided', {
      kind: 'voided',
      type: null,
      purchaseToken: 'token-1',
    });
    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.REFUNDED);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);

    return { ...context, purchase };
  }

  it('뒤따라 온 다른 알림이 환불을 덮지 않는다', async () => {
    const { world, notify } = await setupRefunded();

    await notify('msg-after', { type: 4, purchaseToken: 'token-1' });

    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.REFUNDED);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('환불된 구매 토큰을 다시 제출하면 받지 않는다', async () => {
    const { world, submit } = await setupRefunded();

    await expectBusinessError(
      submit('token-1'),
      ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.REFUNDED);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('복원도 환불된 구매를 연결하지 않는다', async () => {
    const { world, restore } = await setupRefunded();

    const result = await restore(['token-1']);

    expect(result.restored).toBe(false);
    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.REFUNDED);
    expect(world.users.get(USER)!.tier).toBe(UserTier.LIGHT);
  });

  it('그 뒤에 갱신 결제가 되면(만료일이 뒤로 간다) 되살아난다', async () => {
    const { world, purchase, notify } = await setupRefunded();

    purchase.expiresAt = NEXT_EXPIRES_AT;
    await notify('msg-renewed', { type: 2, purchaseToken: 'token-1' });

    expect(world.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      expiresAt: NEXT_EXPIRES_AT,
    });
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });

  it('새 구매 토큰으로 다시 구독하면 되살아난다', async () => {
    const { world, play, submit } = await setupRefunded();

    play.put({ purchaseToken: 'token-2', linkedPurchaseToken: 'token-1' });
    await submit('token-2');

    expect(world.subscriptions).toHaveLength(1);
    expect(world.subscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
    expect(world.users.get(USER)!.tier).toBe(UserTier.PRO);
  });
});
