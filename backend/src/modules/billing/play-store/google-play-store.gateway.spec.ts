import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { SubscriptionEnvironment } from '@/modules/subscription/subscription.enum';

import {
  GoogleHttpError,
  GooglePlayStoreGateway,
  classifyIdTokenError,
  toGoogleHttpError,
  GoogleRequest,
  OidcClaims,
} from './google-play-store.gateway';
import { PlayPushEnvelope, PlayStoreError } from './play-store.gateway';

/**
 * Google과의 통신은 두 이음매(`requestGoogle`·`verifyIdToken`)로만 나간다. 이 테스트는 그 둘을 갈아 끼워
 * **응답 해석과 판정**을 검증한다 — 실제 Google 호출(서비스 계정 서명·OIDC 공개키 조회)은 여기서 돌지 않는다.
 */
const PACKAGE = 'com.runtime.ear';
const PUSH_AUDIENCE = 'https://api.earcast.co.kr/api/v1/webhooks/play-store';
const PUSH_SENDER = 'ear-rtdn@ear-project.iam.gserviceaccount.com';

const SERVICE_ACCOUNT_BASE64 = Buffer.from(
  JSON.stringify({
    client_email: 'ear-play@ear-project.iam.gserviceaccount.com',
    private_key: 'not-a-real-key',
  }),
).toString('base64');

const FULL_ENV = {
  GOOGLE_PLAY_PACKAGE_NAME: PACKAGE,
  GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64: SERVICE_ACCOUNT_BASE64,
  GOOGLE_PLAY_PUBSUB_AUDIENCE: PUSH_AUDIENCE,
  GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT: PUSH_SENDER,
};

type Responder = (request: GoogleRequest) => unknown;

function buildGateway(
  env: Partial<Record<keyof EnvironmentVariables, string>>,
  options: {
    respond?: Responder;
    claims?: OidcClaims | Error;
  } = {},
) {
  const requests: GoogleRequest[] = [];
  const verified: { idToken: string; audience: string }[] = [];
  const config = {
    get: (key: keyof EnvironmentVariables) => env[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;

  const gateway = new (class extends GooglePlayStoreGateway {
    // async — 응답 함수가 던진 오류가 그대로 거절로 나간다(실제 구현이 HTTP 오류를 올리는 방식과 같다)
    // eslint-disable-next-line @typescript-eslint/require-await -- 동기 응답 함수를 Promise 계약에 맞춘다
    protected override async requestGoogle(
      request: GoogleRequest,
    ): Promise<unknown> {
      requests.push(request);

      return options.respond?.(request) ?? {};
    }

    protected override verifyIdToken(
      idToken: string,
      audience: string,
    ): Promise<OidcClaims> {
      verified.push({ idToken, audience });

      return options.claims instanceof Error
        ? Promise.reject(options.claims)
        : Promise.resolve(
            options.claims ?? {
              iss: 'https://accounts.google.com',
              email: PUSH_SENDER,
              email_verified: true,
            },
          );
    }
  })(config);

  return { gateway, requests, verified };
}

/** Google 문서의 `SubscriptionPurchaseV2` 모양 */
function googlePurchase(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'androidpublisher#subscriptionPurchaseV2',
    startTime: '2026-10-01T00:00:00Z',
    regionCode: 'KR',
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    latestOrderId: 'GPA.1234-5678-9012-34567',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    },
    lineItems: [
      {
        productId: 'ear_pro_monthly',
        expiryTime: '2026-11-01T00:00:00Z',
        autoRenewingPlan: { autoRenewEnabled: true },
      },
    ],
    ...overrides,
  };
}

function pushEnvelope(
  notification: Record<string, unknown>,
  messageId = 'msg-1',
): PlayPushEnvelope {
  return {
    message: {
      messageId,
      data: Buffer.from(
        JSON.stringify({
          version: '1.0',
          packageName: PACKAGE,
          eventTimeMillis: '1790000000000',
          ...notification,
        }),
      ).toString('base64'),
    },
  };
}

async function expectRejected(
  work: Promise<unknown>,
  kind: 'invalid' | 'unavailable',
  reason: string,
): Promise<void> {
  const error = await work.then(
    () => {
      throw new Error('expected rejection but resolved');
    },
    (thrown: unknown) => thrown,
  );

  expect(error).toBeInstanceOf(PlayStoreError);
  expect((error as PlayStoreError).kind).toBe(kind);
  expect((error as PlayStoreError).reason).toBe(reason);
}

beforeAll(() => {
  for (const level of ['warn', 'error'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }
});

describe('toGoogleHttpError — 라이브러리 오류를 HTTP 상태로', () => {
  const playUrl =
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.runtime.ear/purchases/subscriptionsv2/tokens/abc';

  it('Play API가 답한 상태는 그대로 올린다', () => {
    expect(
      toGoogleHttpError({ response: { status: 410 }, config: { url: playUrl } })
        .status,
    ).toBe(410);
    // 라이브러리가 URL 객체로 주기도 한다
    expect(
      toGoogleHttpError({
        status: 404,
        config: { url: new URL(playUrl) },
      }).status,
    ).toBe(404);
  });

  it('토큰 발급 주소가 답한 400(서비스 계정 오류)은 "모르는 구매 토큰"이 아니라 자격증명 실패다', () => {
    // 실제 라이브러리가 틀린 서비스 계정에 대해 던지는 모양(2026-10-03 확인)
    const error = {
      status: 400,
      response: { status: 400 },
      config: { url: 'https://oauth2.googleapis.com/token' },
      message: 'invalid_grant: Invalid grant: account not found',
    };

    expect(toGoogleHttpError(error).status).toBe(401);
  });

  it('응답이 없었으면(네트워크) 상태가 없다', () => {
    expect(toGoogleHttpError(new Error('socket hang up')).status).toBeNull();
    expect(toGoogleHttpError(null).status).toBeNull();
  });
});

describe('GooglePlayStoreGateway', () => {
  describe('구성', () => {
    it.each([
      [
        '패키지명이 없으면',
        { GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64: SERVICE_ACCOUNT_BASE64 },
      ],
      ['서비스 계정이 없으면', { GOOGLE_PLAY_PACKAGE_NAME: PACKAGE }],
      [
        '서비스 계정 값이 깨졌으면',
        {
          GOOGLE_PLAY_PACKAGE_NAME: PACKAGE,
          GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64: 'not-base64-json',
        },
      ],
    ])('%s 꺼져 있고 Google을 부르지 않는다', async (_label, env) => {
      const { gateway, requests } = buildGateway(env);

      expect(gateway.isEnabled()).toBe(false);
      await expectRejected(
        gateway.fetchPurchase('token'),
        'invalid',
        'not_configured',
      );
      expect(requests).toHaveLength(0);
    });

    it('알림 검증값이 없어도 구매 검증은 켜진다', () => {
      expect(
        buildGateway({
          GOOGLE_PLAY_PACKAGE_NAME: PACKAGE,
          GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64: SERVICE_ACCOUNT_BASE64,
        }).gateway.isEnabled(),
      ).toBe(true);
    });
  });

  describe('구매 조회', () => {
    it('우리 앱의 그 토큰을 조회하고, 응답을 우리가 쓰는 필드로 옮긴다', async () => {
      const { gateway, requests } = buildGateway(FULL_ENV, {
        respond: () => googlePurchase(),
      });

      await expect(gateway.fetchPurchase('tok/en+1')).resolves.toEqual({
        purchaseToken: 'tok/en+1',
        linkedPurchaseToken: null,
        productId: 'ear_pro_monthly',
        state: 'active',
        startedAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: new Date('2026-11-01T00:00:00Z'),
        isAutoRenew: true,
        pendingProductId: null,
        // 계정 토큰은 소문자로 맞춘다 — 결제 의도의 id와 대조한다
        accountToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        environment: SubscriptionEnvironment.PRODUCTION,
        needsAcknowledge: true,
        orderId: 'GPA.1234-5678-9012-34567',
      });
      // 토큰은 경로에 들어가므로 인코딩한다 — `/`·`+`가 그대로 나가면 다른 경로가 된다
      expect(requests).toEqual([
        {
          method: 'GET',
          url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/purchases/subscriptionsv2/tokens/tok%2Fen%2B1`,
        },
      ]);
    });

    it.each([
      ['SUBSCRIPTION_STATE_CANCELED', 'canceled'],
      ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'grace'],
      ['SUBSCRIPTION_STATE_ON_HOLD', 'on_hold'],
      ['SUBSCRIPTION_STATE_PAUSED', 'paused'],
      ['SUBSCRIPTION_STATE_EXPIRED', 'expired'],
      ['SUBSCRIPTION_STATE_PENDING', 'pending'],
      ['SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'expired'],
    ])('%s → %s', async (subscriptionState, expected) => {
      const { gateway } = buildGateway(FULL_ENV, {
        respond: () => googlePurchase({ subscriptionState }),
      });

      expect((await gateway.fetchPurchase('t'))?.state).toBe(expected);
    });

    it('시험 구매·이전 토큰·다운그레이드 예약·확인 여부를 읽는다', async () => {
      const { gateway } = buildGateway(FULL_ENV, {
        respond: () =>
          googlePurchase({
            testPurchase: {},
            linkedPurchaseToken: 'old-token',
            acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
            externalAccountIdentifiers: undefined,
            lineItems: [
              {
                productId: 'ear_pro_monthly',
                expiryTime: '2026-11-01T00:00:00Z',
                autoRenewingPlan: { autoRenewEnabled: false },
                deferredItemReplacement: { productId: 'ear_daily_monthly' },
              },
            ],
          }),
      });

      expect(await gateway.fetchPurchase('t')).toMatchObject({
        environment: SubscriptionEnvironment.SANDBOX,
        linkedPurchaseToken: 'old-token',
        needsAcknowledge: false,
        accountToken: null,
        isAutoRenew: false,
        pendingProductId: 'ear_daily_monthly',
      });
    });

    it('예약 줄에 autoRenewingPlan 이 아예 없어도 자동 갱신이다', async () => {
      const { gateway } = buildGateway(FULL_ENV, {
        respond: () =>
          googlePurchase({
            lineItems: [
              {
                productId: 'ear_pro_monthly',
                expiryTime: '2026-11-01T00:00:00Z',
                deferredItemReplacement: { productId: 'ear_daily_monthly' },
              },
            ],
          }),
      });

      expect((await gateway.fetchPurchase('t'))?.isAutoRenew).toBe(true);
    });

    it('다운그레이드 예약 중인 줄은 autoRenewingPlan 이 없어도 자동 갱신이다 — 다음 갱신이 예약 상품으로 이어진다(2026-10-08 실측 응답)', async () => {
      const { gateway } = buildGateway(FULL_ENV, {
        respond: () =>
          googlePurchase({
            lineItems: [
              // 실측: 예약된 상품의 자리표시 줄(만료 없음)과 지금 상품의 줄이 함께 온다
              {
                productId: 'ear_daily_monthly',
                autoRenewingPlan: {},
              },
              {
                productId: 'ear_pro_monthly',
                expiryTime: '2026-11-01T00:00:00Z',
                // 실측: autoRenewEnabled 가 없는 빈 객체
                autoRenewingPlan: {},
                deferredItemReplacement: { productId: 'ear_daily_monthly' },
              },
            ],
          }),
      });

      expect(await gateway.fetchPurchase('t')).toMatchObject({
        productId: 'ear_pro_monthly',
        isAutoRenew: true,
        pendingProductId: 'ear_daily_monthly',
      });
    });

    it.each([400, 404, 410])(
      'Google이 %i 로 답하면 모르는 토큰이다(null)',
      async (status) => {
        const { gateway } = buildGateway(FULL_ENV, {
          respond: () => {
            throw new GoogleHttpError(status);
          },
        });

        await expect(gateway.fetchPurchase('t')).resolves.toBeNull();
      },
    );

    it.each([
      ['서버 오류(500)', 500],
      ['자격증명 거부(403)', 403],
      ['응답 없음(네트워크)', null],
    ])(
      '%s 는 위조가 아니라 "지금은 확인할 수 없음"이다',
      async (_label, status) => {
        const { gateway } = buildGateway(FULL_ENV, {
          respond: () => {
            throw new GoogleHttpError(status);
          },
        });

        await expectRejected(
          gateway.fetchPurchase('t'),
          'unavailable',
          'purchase_query_failed',
        );
      },
    );

    it('상태를 모르거나 구독 줄이 없는 응답은 구독으로 다루지 않는다', async () => {
      const unknownState = buildGateway(FULL_ENV, {
        respond: () =>
          googlePurchase({ subscriptionState: 'SUBSCRIPTION_STATE_NEW_THING' }),
      });
      const noLineItem = buildGateway(FULL_ENV, {
        respond: () => googlePurchase({ lineItems: [] }),
      });

      await expect(unknownState.gateway.fetchPurchase('t')).resolves.toBeNull();
      await expect(noLineItem.gateway.fetchPurchase('t')).resolves.toBeNull();
    });
  });

  describe('구매 확인(acknowledge)', () => {
    it('그 상품·그 토큰의 확인 엔드포인트를 부른다', async () => {
      const { gateway, requests } = buildGateway(FULL_ENV);

      await gateway.acknowledge('ear_pro_monthly', 'tok/en');

      expect(requests).toEqual([
        {
          method: 'POST',
          url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/purchases/subscriptions/ear_pro_monthly/tokens/tok%2Fen:acknowledge`,
        },
      ]);
    });

    it('실패하면 재시도 대상으로 올린다 — 확인하지 못한 구매는 3일 뒤 환불된다', async () => {
      const { gateway } = buildGateway(FULL_ENV, {
        respond: () => {
          throw new GoogleHttpError(503);
        },
      });

      await expectRejected(
        gateway.acknowledge('ear_pro_monthly', 't'),
        'unavailable',
        'acknowledge_failed',
      );
    });
  });

  describe('실시간 알림(Pub/Sub push) 검증', () => {
    const subscriptionNotification = {
      subscriptionNotification: {
        version: '1.0',
        notificationType: 3,
        purchaseToken: 'token-1',
        subscriptionId: 'ear_pro_monthly',
      },
    };

    it('OIDC 토큰을 구성된 대상(audience)으로 검증하고 구독 알림을 푼다', async () => {
      const { gateway, verified } = buildGateway(FULL_ENV);

      await expect(
        gateway.verifyNotification(
          'Bearer signed-oidc-token',
          pushEnvelope(subscriptionNotification, 'msg-42'),
        ),
      ).resolves.toEqual({
        id: 'msg-42',
        kind: 'subscription',
        type: 3,
        purchaseToken: 'token-1',
        eventAt: new Date(1790000000000),
      });
      expect(verified).toEqual([
        { idToken: 'signed-oidc-token', audience: PUSH_AUDIENCE },
      ]);
    });

    it('구독 환불 통지(voided)와 테스트 알림을 구분한다', async () => {
      const { gateway } = buildGateway(FULL_ENV);

      expect(
        await gateway.verifyNotification(
          'Bearer t',
          pushEnvelope({
            voidedPurchaseNotification: {
              purchaseToken: 'token-1',
              orderId: 'GPA.1',
              productType: 1,
              refundType: 1,
            },
          }),
        ),
      ).toMatchObject({ kind: 'voided', purchaseToken: 'token-1' });
      // 일회성 상품의 환불(productType 2)은 구독이 아니다
      expect(
        await gateway.verifyNotification(
          'Bearer t',
          pushEnvelope({
            voidedPurchaseNotification: { purchaseToken: 'x', productType: 2 },
          }),
        ),
      ).toMatchObject({ kind: 'other', purchaseToken: null });
      expect(
        await gateway.verifyNotification(
          'Bearer t',
          pushEnvelope({ testNotification: { version: '1.0' } }),
        ),
      ).toMatchObject({ kind: 'test', purchaseToken: null });
    });

    it.each([
      ['헤더가 없으면', undefined, 'push_token_missing'],
      ['Bearer 형식이 아니면', 'Basic abc', 'push_token_missing'],
    ])('%s 받지 않는다', async (_label, authorization, reason) => {
      const { gateway, verified } = buildGateway(FULL_ENV);

      await expectRejected(
        gateway.verifyNotification(
          authorization,
          pushEnvelope(subscriptionNotification),
        ),
        'invalid',
        reason,
      );
      expect(verified).toHaveLength(0);
    });

    it('토큰 검증이 실패하면(서명·만료·대상 불일치) 받지 않는다', async () => {
      const { gateway } = buildGateway(FULL_ENV, {
        claims: new Error(
          'Wrong recipient, payload audience != requiredAudience',
        ),
      });

      await expectRejected(
        gateway.verifyNotification(
          'Bearer t',
          pushEnvelope(subscriptionNotification),
        ),
        'invalid',
        'push_token_invalid',
      );
    });

    it('토큰 검증 실패 로그에 토큰 전문·본문을 남기지 않는다 — 라이브러리 메시지 대신 사유 코드만 남긴다', async () => {
      const token = 'eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6ImEifQ.c2lnbmF0dXJl';
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      warn.mockClear();
      // google-auth-library 는 오류 메시지 끝에 토큰을 붙인다
      const { gateway } = buildGateway(FULL_ENV, {
        claims: new Error(`Invalid token signature: ${token}`),
      });

      await expectRejected(
        gateway.verifyNotification(
          `Bearer ${token}`,
          pushEnvelope(subscriptionNotification),
        ),
        'invalid',
        'push_token_invalid',
      );

      expect(warn).toHaveBeenCalledWith('play push token rejected', {
        reason: 'bad_signature',
        error_name: 'Error',
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
    });

    it.each([
      ['Wrong number of segments in token: a.b', 'malformed'],
      ['Token used too late, 1 > 0: {"email":"a@b.c"}', 'expired'],
      [
        'Wrong recipient, payload audience != requiredAudience',
        'wrong_audience',
      ],
      ['처음 보는 메시지 eyJ.eyJ.sig', 'other'],
    ])('검증 오류 "%s" 의 사유 코드는 %s 다', (message, kind) => {
      expect(classifyIdTokenError(new Error(message))).toBe(kind);
    });

    it('오류 객체가 아니어도 사유 코드는 other 다 — 값을 그대로 남기지 않는다', () => {
      expect(classifyIdTokenError('eyJ.eyJ.sig')).toBe('other');
    });

    it.each([
      [
        '다른 서비스 계정이 보낸 요청',
        { email: 'someone@else.iam.gserviceaccount.com' },
      ],
      ['이메일이 확인되지 않은 토큰', { email_verified: false }],
      ['Google이 발급하지 않은 토큰', { iss: 'https://evil.example.com' }],
    ])('%s 은 서명이 맞아도 받지 않는다', async (_label, override) => {
      const { gateway } = buildGateway(FULL_ENV, {
        claims: {
          iss: 'https://accounts.google.com',
          email: PUSH_SENDER,
          email_verified: true,
          ...override,
        },
      });

      await expectRejected(
        gateway.verifyNotification(
          'Bearer t',
          pushEnvelope(subscriptionNotification),
        ),
        'invalid',
        'push_sender_mismatch',
      );
    });

    it('다른 앱의 알림은 받지 않는다', async () => {
      const { gateway } = buildGateway(FULL_ENV);

      await expectRejected(
        gateway.verifyNotification(
          'Bearer t',
          pushEnvelope({
            ...subscriptionNotification,
            packageName: 'com.other.app',
          }),
        ),
        'invalid',
        'package_mismatch',
      );
    });

    it('본문이 base64 JSON이 아니면 받지 않는다', async () => {
      const { gateway } = buildGateway(FULL_ENV);

      await expectRejected(
        gateway.verifyNotification('Bearer t', {
          message: { messageId: 'm', data: '%%%not-json%%%' },
        }),
        'invalid',
        'notification_malformed',
      );
    });

    it('알림 검증값(대상·발신 계정)이 구성되지 않았으면 어떤 알림도 받지 않는다', async () => {
      const { gateway, verified } = buildGateway({
        GOOGLE_PLAY_PACKAGE_NAME: PACKAGE,
        GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64: SERVICE_ACCOUNT_BASE64,
      });

      await expectRejected(
        gateway.verifyNotification(
          'Bearer t',
          pushEnvelope(subscriptionNotification),
        ),
        'invalid',
        'push_not_configured',
      );
      expect(verified).toHaveLength(0);
    });
  });
});
