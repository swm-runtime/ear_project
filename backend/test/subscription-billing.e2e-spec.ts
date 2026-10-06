import 'dotenv/config';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { AppStoreGateway } from '@/modules/billing/app-store/app-store.gateway';
import { PlayStoreGateway } from '@/modules/billing/play-store/play-store.gateway';
import {
  FAKE_PLAY_PUSH_TOKEN,
  FakeAppStoreGateway,
  FakePlayStoreGateway,
  PLAY_PRODUCT_DAILY,
  PLAY_PRODUCT_PRO,
  playPushBody,
  NOTIFICATION_RECEIPT_MARKER,
  PRODUCT_DAILY,
  PRODUCT_PRO,
  signTransaction,
} from '@/modules/billing/testing/billing-test-world';
import { SocialProvider } from '@/modules/user/user.enum';

interface SignUpBody {
  access_token: string;
  user: { id: string };
}
interface LoginBody {
  signup_token?: string;
}
interface ErrorBody {
  error_code: string;
  retryable: boolean;
}
interface PlanBody {
  plan_id: string;
  tier: string;
  price_krw: number;
  store_product_id: string | null;
  entitlements: {
    daily_play_limit: number | null;
    daily_drip_count: number;
    drip_enabled: boolean;
    ads_enabled: boolean;
  };
  action: string;
}
interface PlansBody {
  plans: PlanBody[];
  is_email_verified: boolean;
}
interface SubscriptionBody {
  plan: {
    status: string;
    tier: string;
    daily_play_limit: number | null;
    renews_at: string | null;
    expires_at: string | null;
    has_payment_issue: boolean;
  };
  entitlements: PlanBody['entitlements'];
  store: string | null;
  pending_plan: {
    tier: string;
    plan_name: string;
    effective_at: string;
  } | null;
}
interface IntentBody {
  intent_id: string;
  store_product_id: string;
  account_token: string;
}
interface RestoreBody {
  restored: boolean;
  subscription: SubscriptionBody;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * 구독·인앱 결제 E2E — `subscription-api.md` 4.1~4.6을 **실제 DB 위에서** 밟는다.
 *
 * Apple 서명만 가짜다(`FakeAppStoreGateway` — 서명 대신 JSON). 요금제 시드·결제 의도·구독 행·`users.tier`·
 * 알림 로그의 유니크·잠금·트랜잭션은 전부 진짜 PostgreSQL이 한다. 서명 검증 자체는
 * `apple-app-store.gateway.spec.ts`가 진짜 Apple 라이브러리로 따로 검증한다.
 */
describe('구독·인앱 결제 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  /** 가짜 Google Play — 기본은 꺼져 있다(운영의 현재 상태). Play 테스트만 켠다 */
  const play = new FakePlayStoreGateway();
  /** 이 실행의 스토어 구독·알림 ID 접두사 — 다른 실행·다른 테스트와 겹치지 않게 한다 */
  const RUN = `e2e-sub-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const now = Date.now();
  const thisPeriod = {
    purchasedAt: new Date(now - DAY),
    expiresAt: new Date(now + 29 * DAY),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppStoreGateway)
      .useValue(new FakeAppStoreGateway())
      .overrideProvider(PlayStoreGateway)
      .useValue(play)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(traceIdMiddleware);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  }, 60_000);

  afterAll(async () => {
    for (const userId of userIds) {
      // 구독·결제 의도는 `users` FK CASCADE로 함께 지워진다
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    await dataSource.query(
      `DELETE FROM store_notification_logs WHERE notification_id LIKE $1`,
      [`${RUN}%`],
    );
    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-sub-%'`,
    );
    // 탈퇴 테스트가 남긴 아카이브(결제 이력은 법정 보존이라 사용자 삭제로 지워지지 않는다)
    await dataSource.query(
      `DELETE FROM archive.archived_subscriptions WHERE original_transaction_id LIKE $1`,
      [`${RUN}%`],
    );
    await app.close();
  }, 60_000);

  it('요금제 목록 — 시드된 3티어를 낮은 티어부터, 플랫폼 상품 ID·권한·할 수 있는 일과 함께 준다', async () => {
    const { auth, userId } = await createUser('plans');
    await setEmail(userId, false);

    const body = (
      await get('/plans', auth).query({ platform: 'ios' }).expect(HttpStatus.OK)
    ).body as PlansBody;

    expect(body.is_email_verified).toBe(false);
    expect(
      body.plans.map((plan) => [
        plan.tier,
        plan.price_krw,
        plan.store_product_id,
        plan.entitlements.daily_play_limit,
        plan.entitlements.ads_enabled,
        plan.action,
      ]),
    ).toEqual([
      // 구독이 없으면 무료 요금제가 "이용 중"이다(KAN-147)
      ['light', 0, null, 2, true, 'current'],
      ['daily', 3900, PRODUCT_DAILY, 5, false, 'purchase'],
      ['pro', 9900, PRODUCT_PRO, null, false, 'purchase'],
    ]);

    // Android 는 구현 전 — 상품 ID 가 없고 살 수 없다
    const android = (
      await get('/plans', auth)
        .query({ platform: 'android' })
        .expect(HttpStatus.OK)
    ).body as PlansBody;
    expect(
      android.plans
        .filter((plan) => plan.price_krw > 0)
        .every((plan) => plan.action === 'none'),
    ).toBe(true);

    // platform 누락·오값
    await expectError(
      get('/plans', auth),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
    );
    await expectError(
      get('/plans', auth).query({ platform: 'web' }),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
    );
  }, 60_000);

  it('구매 — 이메일 인증 관문 → 결제 의도 → 영수증 제출로 구독과 사용자 티어가 함께 반영된다', async () => {
    const { auth, userId } = await createUser('buy');
    const plans = await listPlans(auth);
    const pro = plans.find((plan) => plan.tier === 'pro')!;
    const otx = `${RUN}-buy`;

    // given — 인증된 이메일이 없다 → 결제 의도부터 막힌다(FR-39)
    await setEmail(userId, false);
    await expectError(
      post('/users/me/subscription/purchase-intents', auth, {
        plan_id: pro.plan_id,
        platform: 'ios',
      }),
      HttpStatus.CONFLICT,
      ErrorCode.EMAIL_REQUIRED_FOR_PURCHASE,
    );

    // 무료 요금제·Android 는 구독할 수 없다
    await setEmail(userId, true);
    await expectError(
      post('/users/me/subscription/purchase-intents', auth, {
        plan_id: plans.find((plan) => plan.tier === 'light')!.plan_id,
        platform: 'ios',
      }),
      HttpStatus.BAD_REQUEST,
      ErrorCode.SUBSCRIPTION_PLAN_UNAVAILABLE,
    );
    await expectError(
      post('/users/me/subscription/purchase-intents', auth, {
        plan_id: pro.plan_id,
        platform: 'android',
      }),
      HttpStatus.BAD_REQUEST,
      ErrorCode.SUBSCRIPTION_PLAN_UNAVAILABLE,
    );

    // when — 결제 의도
    const intent = (
      await post('/users/me/subscription/purchase-intents', auth, {
        plan_id: pro.plan_id,
        platform: 'ios',
        entry_point: 'paywall',
      }).expect(HttpStatus.CREATED)
    ).body as IntentBody;
    expect(intent.store_product_id).toBe(PRODUCT_PRO);
    expect(intent.account_token).toBe(intent.intent_id);

    // 결제 전에는 무료다
    expect((await getSubscription(auth)).plan).toMatchObject({
      status: 'free',
      tier: 'light',
    });

    // when — 영수증 제출(결제에 실어 보낸 계정 토큰이 서명된 거래에 담겨 온다)
    const signed = signTransaction({
      ...thisPeriod,
      originalTransactionId: otx,
      productId: PRODUCT_PRO,
      accountToken: intent.account_token,
    });
    const purchased = (
      await post('/users/me/subscription/purchases', auth, {
        platform: 'ios',
        intent_id: intent.intent_id,
        signed_transaction: signed,
      }).expect(HttpStatus.OK)
    ).body as SubscriptionBody;

    // then — 응답이 곧 확정 상태다
    expect(purchased).toMatchObject({
      plan: {
        status: 'subscribed',
        tier: 'pro',
        daily_play_limit: null,
        renews_at: thisPeriod.expiresAt.toISOString(),
        expires_at: null,
        has_payment_issue: false,
      },
      entitlements: { daily_play_limit: null, ads_enabled: false },
      store: 'app_store',
      pending_plan: null,
    });

    // then — 구독 행·티어 캐시·의도 상태가 한 번에 반영됐다
    expect(await subscriptionRows(otx)).toEqual([
      expect.objectContaining({
        user_id: userId,
        tier: 'pro',
        status: 'active',
        is_auto_renew: true,
        store: 'app_store',
        environment: 'sandbox',
        pending_tier: null,
      }),
    ]);
    expect(await userTier(userId)).toBe('pro');
    expect(
      await dataSource.query(
        `SELECT status FROM purchase_intents WHERE id = $1`,
        [intent.intent_id],
      ),
    ).toEqual([{ status: 'verified' }]);

    // 같은 거래를 다시 보내도 같은 결과다(행이 늘지 않는다)
    const again = (
      await post('/users/me/subscription/purchases', auth, {
        platform: 'ios',
        signed_transaction: signed,
      }).expect(HttpStatus.OK)
    ).body as SubscriptionBody;
    expect(again).toEqual(purchased);
    expect(await subscriptionRows(otx)).toHaveLength(1);

    // 조회·요금제 목록도 같은 상태를 본다
    expect(await getSubscription(auth)).toEqual(purchased);
    expect((await listPlans(auth)).map((plan) => plan.action)).toEqual([
      'none',
      'downgrade',
      'current',
    ]);

    // 다른 계정이 같은 스토어 구독을 내면 받지 않는다
    const other = await createUser('buy-other');
    await expectError(
      post('/users/me/subscription/purchases', other.auth, {
        platform: 'ios',
        signed_transaction: signed,
      }),
      HttpStatus.CONFLICT,
      ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
    );
    await expectError(
      post('/users/me/subscription/restore', other.auth, {
        platform: 'ios',
        signed_transactions: [signed],
      }),
      HttpStatus.CONFLICT,
      ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
    );
    expect(await userTier(other.userId)).toBe('light');
  }, 60_000);

  it('영수증 제출 — 받을 수 없는 거래는 오류이고 아무것도 쓰지 않는다', async () => {
    const { auth, userId } = await createUser('reject');
    const otx = `${RUN}-reject`;

    const cases: [object, HttpStatus, ErrorCode][] = [
      // 만료된 거래
      [
        {
          signed_transaction: signTransaction({
            originalTransactionId: otx,
            purchasedAt: new Date(now - 40 * DAY),
            expiresAt: new Date(now - 10 * DAY),
          }),
        },
        HttpStatus.BAD_REQUEST,
        ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      ],
      // 모르는 상품
      [
        {
          signed_transaction: signTransaction({
            ...thisPeriod,
            originalTransactionId: otx,
            productId: 'com.other.product',
          }),
        },
        HttpStatus.BAD_REQUEST,
        ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      ],
      // 서명 불일치
      [
        { signed_transaction: signTransaction({ invalid: 'invalid' }) },
        HttpStatus.BAD_REQUEST,
        ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      ],
      // 스토어 확인 일시 실패 — 재시도 가능
      [
        { signed_transaction: signTransaction({ invalid: 'unavailable' }) },
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SUBSCRIPTION_STORE_UNAVAILABLE,
      ],
      // iOS 인데 서명된 거래가 없다
      [{}, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED],
    ];

    for (const [body, status, errorCode] of cases) {
      const error = await expectError(
        post('/users/me/subscription/purchases', auth, {
          platform: 'ios',
          ...body,
        }),
        status,
        errorCode,
      );
      expect(error.retryable).toBe(
        errorCode === ErrorCode.SUBSCRIPTION_STORE_UNAVAILABLE,
      );
    }

    expect(await subscriptionRows(otx)).toHaveLength(0);
    expect(await userTier(userId)).toBe('light');
  }, 60_000);

  it('스토어 서버 알림 — 해지 예약 → 다운그레이드 예약 → 환불이 구독과 티어에 반영되고, 재전송은 한 번만 처리된다', async () => {
    const { auth, userId } = await createUser('webhook');
    const otx = `${RUN}-webhook`;
    const transaction = {
      ...thisPeriod,
      originalTransactionId: otx,
      productId: PRODUCT_PRO,
    };

    await post('/users/me/subscription/purchases', auth, {
      platform: 'ios',
      signed_transaction: signTransaction(transaction),
    }).expect(HttpStatus.OK);

    // when — 해지 예약(인증 헤더 없이 Apple 이 부른다)
    const cancel = {
      id: `${RUN}-n1`,
      type: 'DID_CHANGE_RENEWAL_STATUS',
      subtype: 'AUTO_RENEW_DISABLED',
      signedAt: new Date(now),
      transaction,
      renewal: { isAutoRenew: false, autoRenewProductId: PRODUCT_PRO },
    };
    await webhook(cancel).expect(HttpStatus.OK);

    // then — 만료일까지 유효하고 화면은 해지 예약으로 그린다
    expect((await getSubscription(auth)).plan).toMatchObject({
      status: 'cancel_scheduled',
      tier: 'pro',
      renews_at: null,
      expires_at: thisPeriod.expiresAt.toISOString(),
    });
    expect(await userTier(userId)).toBe('pro');

    // 같은 알림의 재전송 — 200 이고 로그는 한 행, 처리도 한 번
    await webhook(cancel).expect(HttpStatus.OK);
    const logs = await dataSource.query<
      { type: string; processed_at: Date | null; payload: object }[]
    >(
      `SELECT type, processed_at, payload FROM store_notification_logs WHERE notification_id = $1`,
      [cancel.id],
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('DID_CHANGE_RENEWAL_STATUS:AUTO_RENEW_DISABLED');
    expect(logs[0].processed_at).not.toBeNull();
    // 서명 원문은 적재하지 않는다 — 풀어낸 값만(가짜 검증기는 알림 속 거래의 원문을 이 표식으로 채운다)
    expect(JSON.stringify(logs[0].payload)).not.toContain(
      NOTIFICATION_RECEIPT_MARKER,
    );
    expect(JSON.stringify(logs[0].payload)).not.toContain('receipt');
    expect(logs[0].payload).toMatchObject({
      transaction: { original_transaction_id: otx },
    });

    // when — 다시 켜고 데일리로 다운그레이드 예약
    await webhook({
      id: `${RUN}-n2`,
      type: 'DID_CHANGE_RENEWAL_PREF',
      subtype: 'DOWNGRADE',
      signedAt: new Date(now + 1000),
      transaction,
      renewal: { isAutoRenew: true, autoRenewProductId: PRODUCT_DAILY },
    }).expect(HttpStatus.OK);

    // then — 티어는 그대로, 예약만 보인다
    const pending = await getSubscription(auth);
    expect(pending.plan.tier).toBe('pro');
    expect(pending.pending_plan).toEqual({
      tier: 'daily',
      plan_name: 'Daily',
      effective_at: thisPeriod.expiresAt.toISOString(),
    });

    // 순서가 뒤바뀐 옛 알림은 덮지 않는다(예약보다 먼저 서명된 "예약 취소")
    await webhook({
      id: `${RUN}-n0`,
      type: 'DID_CHANGE_RENEWAL_PREF',
      signedAt: new Date(now + 500),
      transaction,
      renewal: { isAutoRenew: true, autoRenewProductId: PRODUCT_PRO },
    }).expect(HttpStatus.OK);
    expect((await getSubscription(auth)).pending_plan?.tier).toBe('daily');

    // when — 환불
    await webhook({
      id: `${RUN}-n3`,
      type: 'REFUND',
      signedAt: new Date(now + 2000),
      transaction: { ...transaction, revokedAt: new Date(now + 2000) },
    }).expect(HttpStatus.OK);

    // then — 만료 전이어도 즉시 무료다
    expect(await getSubscription(auth)).toMatchObject({
      plan: { status: 'free', tier: 'light', daily_play_limit: 2 },
      entitlements: { daily_play_limit: 2, ads_enabled: true },
      store: null,
      pending_plan: null,
    });
    expect(await userTier(userId)).toBe('light');
    expect(await subscriptionRows(otx)).toEqual([
      expect.objectContaining({ status: 'refunded', pending_tier: null }),
    ]);

    // 환불 뒤에 환불 전 거래를 다시 내도 되살아나지 않는다
    await expectError(
      post('/users/me/subscription/purchases', auth, {
        platform: 'ios',
        signed_transaction: signTransaction(transaction),
      }),
      HttpStatus.BAD_REQUEST,
      ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
    );
    expect(await userTier(userId)).toBe('light');
  }, 60_000);

  it('스토어 서버 알림 — 영수증 제출보다 먼저 오면 계정 토큰으로 구독을 만들고, 주인을 모르면 처리 완료로 두지 않는다', async () => {
    const { auth, userId } = await createUser('first');
    await setEmail(userId, true);
    const pro = (await listPlans(auth)).find((plan) => plan.tier === 'pro')!;
    const intent = (
      await post('/users/me/subscription/purchase-intents', auth, {
        plan_id: pro.plan_id,
        platform: 'ios',
      }).expect(HttpStatus.CREATED)
    ).body as IntentBody;
    const otx = `${RUN}-first`;

    // when — 앱이 영수증을 내기 전에 Apple 의 구매 알림이 먼저 도착
    await webhook({
      id: `${RUN}-f1`,
      type: 'SUBSCRIBED',
      subtype: 'INITIAL_BUY',
      signedAt: new Date(now),
      transaction: {
        ...thisPeriod,
        originalTransactionId: otx,
        productId: PRODUCT_DAILY,
        accountToken: intent.account_token,
      },
      renewal: { isAutoRenew: true, autoRenewProductId: PRODUCT_DAILY },
    }).expect(HttpStatus.OK);

    // then — 토큰의 주인에게 구독이 생겼다
    expect(await userTier(userId)).toBe('daily');
    expect((await getSubscription(auth)).entitlements.daily_play_limit).toBe(5);

    // when — 계정 토큰이 없는 구독의 알림(누구 것인지 모른다)
    const orphan = `${RUN}-f2`;
    await webhook({
      id: orphan,
      type: 'SUBSCRIBED',
      signedAt: new Date(now),
      transaction: { ...thisPeriod, originalTransactionId: `${RUN}-orphan` },
    }).expect(HttpStatus.OK);

    // then — 받았지만 처리 완료가 아니다. 구독 행도 만들지 않는다
    expect(
      await dataSource.query(
        `SELECT processed_at FROM store_notification_logs WHERE notification_id = $1`,
        [orphan],
      ),
    ).toEqual([{ processed_at: null }]);
    expect(await subscriptionRows(`${RUN}-orphan`)).toHaveLength(0);

    // 서명이 틀린 알림은 400, 형식이 틀리면 검증 오류 — 적재하지 않는다
    await webhook({
      id: `${RUN}-bad`,
      type: 'TEST',
      invalid: 'invalid',
    }).expect(HttpStatus.BAD_REQUEST);
    await request(app.getHttpServer())
      .post(path('/webhooks/app-store'))
      .send({})
      .expect(HttpStatus.BAD_REQUEST);
    expect(
      await dataSource.query(
        `SELECT 1 FROM store_notification_logs WHERE notification_id = $1`,
        [`${RUN}-bad`],
      ),
    ).toHaveLength(0);
  }, 60_000);

  it('구매 복원 — 유효한 거래만 연결하고, 없으면 오류가 아니라 "없음"이다', async () => {
    const { auth, userId } = await createUser('restore');
    const otx = `${RUN}-restore`;

    // 보낼 거래가 없다
    const empty = (
      await post('/users/me/subscription/restore', auth, {
        platform: 'ios',
        signed_transactions: [],
      }).expect(HttpStatus.OK)
    ).body as RestoreBody;
    expect(empty.restored).toBe(false);
    expect(empty.subscription.plan.status).toBe('free');

    // 만료된 거래는 무시한다
    const expiredOnly = (
      await post('/users/me/subscription/restore', auth, {
        platform: 'ios',
        signed_transactions: [
          signTransaction({
            originalTransactionId: `${otx}-old`,
            purchasedAt: new Date(now - 60 * DAY),
            expiresAt: new Date(now - 30 * DAY),
          }),
        ],
      }).expect(HttpStatus.OK)
    ).body as RestoreBody;
    expect(expiredOnly.restored).toBe(false);
    expect(await userTier(userId)).toBe('light');

    // 유효한 거래 — 연결되고 티어가 붙는다
    const restored = (
      await post('/users/me/subscription/restore', auth, {
        platform: 'ios',
        signed_transactions: [
          signTransaction({
            ...thisPeriod,
            originalTransactionId: otx,
            productId: PRODUCT_DAILY,
          }),
        ],
      }).expect(HttpStatus.OK)
    ).body as RestoreBody;
    expect(restored.restored).toBe(true);
    expect(restored.subscription.plan).toMatchObject({
      status: 'subscribed',
      tier: 'daily',
    });
    expect(await userTier(userId)).toBe('daily');

    // 11건은 받지 않는다(상한 10)
    await expectError(
      post('/users/me/subscription/restore', auth, {
        platform: 'ios',
        signed_transactions: Array.from({ length: 11 }, () => 'x'),
      }),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
    );
  }, 60_000);

  it('Google Play — 구매 제출·토큰 교체·알림이 한 구독 행에 반영되고, 탈퇴가 긴 토큰을 아카이브한다', async () => {
    const { auth, userId } = await createUser('play');
    await setEmail(userId, true);

    // given — Play 상품이 등록되고 서버 검증이 켜진 상태(운영에는 아직 상품이 없어 꺼져 있다)
    const previous = await dataSource.query<
      { tier: string; store_product_id_android: string | null }[]
    >(
      `SELECT tier, store_product_id_android FROM plans WHERE tier IN ('daily', 'pro')`,
    );
    await dataSource.query(
      `UPDATE plans SET store_product_id_android = CASE tier WHEN 'daily' THEN $1 ELSE $2 END WHERE tier IN ('daily', 'pro')`,
      [PLAY_PRODUCT_DAILY, PLAY_PRODUCT_PRO],
    );
    play.enabled = true;

    try {
      // Android 요금제 목록에 상품 ID 와 구독하기가 나온다
      const android = (
        await get('/plans', auth)
          .query({ platform: 'android' })
          .expect(HttpStatus.OK)
      ).body as PlansBody;
      expect(
        android.plans.map((plan) => [plan.store_product_id, plan.action]),
      ).toEqual([
        [null, 'none'],
        [PLAY_PRODUCT_DAILY, 'purchase'],
        [PLAY_PRODUCT_PRO, 'purchase'],
      ]);

      const daily = android.plans.find((plan) => plan.tier === 'daily')!;
      const intent = (
        await post('/users/me/subscription/purchase-intents', auth, {
          plan_id: daily.plan_id,
          platform: 'android',
        }).expect(HttpStatus.CREATED)
      ).body as IntentBody;
      expect(intent.store_product_id).toBe(PLAY_PRODUCT_DAILY);

      // Play 구매 토큰은 길다 — 255자를 넘는 값이 키로 저장돼야 한다
      const firstToken = `${RUN}-play-`.padEnd(900, 'a');
      const purchase = play.put({
        purchaseToken: firstToken,
        productId: PLAY_PRODUCT_DAILY,
        accountToken: intent.account_token,
        startedAt: thisPeriod.purchasedAt,
        expiresAt: thisPeriod.expiresAt,
      });

      // when — 영수증 제출
      const purchased = (
        await post('/users/me/subscription/purchases', auth, {
          platform: 'android',
          intent_id: intent.intent_id,
          purchase_token: firstToken,
          product_id: PLAY_PRODUCT_DAILY,
        }).expect(HttpStatus.OK)
      ).body as SubscriptionBody;

      // then — 구독·티어가 반영되고, 그 뒤에 구매가 확인됐다
      expect(purchased).toMatchObject({
        plan: { status: 'subscribed', tier: 'daily', daily_play_limit: 5 },
        store: 'play_store',
      });
      expect(await userTier(userId)).toBe('daily');
      expect(play.acknowledged).toEqual([firstToken]);
      expect(await subscriptionRows(firstToken)).toEqual([
        expect.objectContaining({
          user_id: userId,
          tier: 'daily',
          status: 'active',
          store: 'play_store',
          environment: 'sandbox',
        }),
      ]);

      // when — 업그레이드: 새 토큰이 발급되고 Google 이 이전 토큰을 알려 준다
      const secondToken = `${RUN}-play2-`.padEnd(900, 'b');
      play.put({
        purchaseToken: secondToken,
        linkedPurchaseToken: firstToken,
        productId: PLAY_PRODUCT_PRO,
        startedAt: new Date(now),
        expiresAt: new Date(now + 30 * DAY),
      });
      await post('/users/me/subscription/purchases', auth, {
        platform: 'android',
        purchase_token: secondToken,
        product_id: PLAY_PRODUCT_PRO,
      }).expect(HttpStatus.OK);

      // then — 같은 행이 갱신된다(행이 늘지 않고, 키는 최초 토큰 그대로)
      expect(
        await dataSource.query(
          `SELECT original_transaction_id = $2 AS same_key, latest_receipt = $3 AS latest, tier
             FROM subscriptions WHERE user_id = $1`,
          [userId, firstToken, secondToken],
        ),
      ).toEqual([{ same_key: true, latest: true, tier: 'pro' }]);
      expect(await userTier(userId)).toBe('pro');
      expect(purchase.needsAcknowledge).toBe(false);

      // when — 사용자가 Play 에서 해지 → 알림(Pub/Sub push, snake_case 필드와 부가 필드가 섞여 온다)
      play.purchases.get(secondToken)!.state = 'canceled';
      const body = playPushBody(`${RUN}-pm1`, {
        kind: 'subscription',
        type: 3,
        purchaseToken: secondToken,
      });
      const pushBody = {
        message: {
          data: body.message.data,
          messageId: `${RUN}-pm1`,
          message_id: `${RUN}-pm1`,
          publishTime: new Date(now).toISOString(),
          publish_time: new Date(now).toISOString(),
          attributes: { source: 'e2e' },
        },
        subscription: 'projects/ear/subscriptions/rtdn-push',
        deliveryAttempt: 1,
      };
      await playWebhook(pushBody).expect(HttpStatus.OK);

      // then — 해지 예약으로 보이고 티어는 유지된다
      expect((await getSubscription(auth)).plan).toMatchObject({
        status: 'cancel_scheduled',
        tier: 'pro',
      });
      // 재전송은 한 번만 처리된다
      await playWebhook(pushBody).expect(HttpStatus.OK);
      const logs = await dataSource.query<
        { type: string; processed_at: Date | null; payload: object }[]
      >(
        `SELECT type, processed_at, payload FROM store_notification_logs WHERE store = 'play_store' AND notification_id = $1`,
        [`${RUN}-pm1`],
      );
      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe('SUBSCRIPTION:3');
      expect(logs[0].processed_at).not.toBeNull();
      // 구매 토큰 원문은 적재하지 않는다
      expect(JSON.stringify(logs[0].payload)).not.toContain(secondToken);

      // 보낸 쪽을 확인할 수 없으면 400, 봉투 모양이 아니면 검증 오류
      await request(app.getHttpServer())
        .post(path('/webhooks/play-store'))
        .set('Authorization', 'Bearer forged')
        .send(pushBody)
        .expect(HttpStatus.BAD_REQUEST);
      await playWebhook({ message: {} }).expect(HttpStatus.BAD_REQUEST);

      // when — 철회(환불) 알림
      await playWebhook(
        playPushBody(`${RUN}-pm2`, {
          kind: 'subscription',
          type: 12,
          purchaseToken: secondToken,
        }),
      ).expect(HttpStatus.OK);

      // then — 즉시 무료
      expect(await userTier(userId)).toBe('light');
      expect((await getSubscription(auth)).plan.status).toBe('free');

      // when — 탈퇴: 결제 이력이 있어 구독이 아카이브로 옮겨진다(긴 토큰이 그대로 들어가야 한다)
      await request(app.getHttpServer())
        .post(path('/users/me/withdraw'))
        .set('Authorization', auth)
        .set('Idempotency-Key', `e2e-sub-withdraw-${RUN}`)
        .send({ confirm: true, agreed_subscription_expiry: true })
        .expect(HttpStatus.NO_CONTENT);

      // then — 900자 토큰이 잘리지 않고 아카이브됐고, 원 구독 행은 파기됐다
      expect(
        await dataSource.query(
          `SELECT count(*)::int AS archived FROM archive.archived_subscriptions WHERE original_transaction_id = $1`,
          [firstToken],
        ),
      ).toEqual([{ archived: 1 }]);
      expect(await subscriptionRows(firstToken)).toHaveLength(0);
    } finally {
      play.enabled = false;
      for (const row of previous) {
        await dataSource.query(
          `UPDATE plans SET store_product_id_android = $2 WHERE tier = $1`,
          [row.tier, row.store_product_id_android],
        );
      }
    }
  }, 60_000);

  it('인증 없이는 구독 API를 부를 수 없다 — 웹훅만 예외다', async () => {
    await request(app.getHttpServer())
      .get(path('/plans'))
      .query({ platform: 'ios' })
      .expect(HttpStatus.UNAUTHORIZED);
    await request(app.getHttpServer())
      .get(path('/users/me/subscription'))
      .expect(HttpStatus.UNAUTHORIZED);
    await request(app.getHttpServer())
      .post(path('/users/me/subscription/purchases'))
      .send({ platform: 'ios', signed_transaction: 'x' })
      .expect(HttpStatus.UNAUTHORIZED);
  }, 60_000);

  const path = (suffix: string) => `/api/v1${suffix}`;
  const get = (suffix: string, auth: string) =>
    request(app.getHttpServer()).get(path(suffix)).set('Authorization', auth);
  const post = (suffix: string, auth: string, body: object) =>
    request(app.getHttpServer())
      .post(path(suffix))
      .set('Authorization', auth)
      .send(body);
  /** Apple 이 보내는 모양 그대로 — 인증 헤더가 없고 본문은 `signedPayload` 하나다 */
  const webhook = (notification: object) =>
    request(app.getHttpServer())
      .post(path('/webhooks/app-store'))
      .send({ signedPayload: JSON.stringify(notification) });

  /** Pub/Sub push 가 보내는 모양 — 사용자 인증 대신 OIDC 토큰이 `Authorization` 에 온다 */
  const playWebhook = (body: object) =>
    request(app.getHttpServer())
      .post(path('/webhooks/play-store'))
      .set('Authorization', `Bearer ${FAKE_PLAY_PUSH_TOKEN}`)
      .send(body);

  async function expectError(
    call: request.Test,
    status: HttpStatus,
    errorCode: ErrorCode,
  ): Promise<ErrorBody> {
    const response = await call.expect(status);
    const body = response.body as ErrorBody;

    expect(body.error_code).toBe(errorCode);

    return body;
  }

  async function listPlans(auth: string): Promise<PlanBody[]> {
    return (
      (
        await get('/plans', auth)
          .query({ platform: 'ios' })
          .expect(HttpStatus.OK)
      ).body as PlansBody
    ).plans;
  }

  async function getSubscription(auth: string): Promise<SubscriptionBody> {
    return (await get('/users/me/subscription', auth).expect(HttpStatus.OK))
      .body as SubscriptionBody;
  }

  async function subscriptionRows(
    originalTransactionId: string,
  ): Promise<Record<string, unknown>[]> {
    return dataSource.query(
      `SELECT user_id, tier, status, is_auto_renew, store, environment, pending_tier
         FROM subscriptions WHERE original_transaction_id = $1`,
      [originalTransactionId],
    );
  }

  async function userTier(userId: string): Promise<string> {
    const rows = await dataSource.query<{ tier: string }[]>(
      `SELECT tier FROM users WHERE id = $1`,
      [userId],
    );

    return rows[0].tier;
  }

  /** 이메일 인증 상태를 직접 맞춘다 — 인증 흐름(메일 발송·코드 확인)은 이 테스트의 대상이 아니다 */
  async function setEmail(userId: string, isVerified: boolean): Promise<void> {
    await dataSource.query(
      `UPDATE users SET email = $2, is_email_verified = $3 WHERE id = $1`,
      [userId, `${userId}@e2e.example.com`, isVerified],
    );
  }

  async function createUser(
    label: string,
  ): Promise<{ userId: string; auth: string }> {
    const providerToken = `e2e-sub-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const deviceId = `e2e-sub-device-${label}`;
    const login = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: deviceId,
      })
      .expect(HttpStatus.OK);
    const signUp = await request(app.getHttpServer())
      .post(path('/auth/sign-up'))
      .set('Idempotency-Key', `e2e-sub-signup-${providerToken}`)
      .send({
        signup_token: (login.body as LoginBody).signup_token,
        device_id: deviceId,
        consents: [
          { consent_type: 'terms', version: '0.1', is_agreed: true },
          { consent_type: 'privacy', version: '0.1', is_agreed: true },
          { consent_type: 'age_confirmation', version: null, is_agreed: true },
        ],
      })
      .expect(HttpStatus.CREATED);
    const body = signUp.body as SignUpBody;

    userIds.push(body.user.id);

    return { userId: body.user.id, auth: `Bearer ${body.access_token}` };
  }
});
