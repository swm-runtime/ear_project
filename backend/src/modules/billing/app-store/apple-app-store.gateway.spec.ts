import { createSign } from 'crypto';

import { ConfigService } from '@nestjs/config';
import { KEYUTIL, KJUR } from 'jsrsasign';

import { EnvironmentVariables } from '@/config/env.validation';
import {
  SubscriptionEnvironment,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';

import { AppStoreVerificationError } from './app-store.gateway';
import { AppleAppStoreGateway } from './apple-app-store.gateway';

/**
 * **진짜 Apple 라이브러리로 검증 경로 전체를 돈다** — 가짜가 아니다.
 *
 * Apple의 개인키는 없으므로 같은 모양의 인증서 체인(루트 → 중간 → 말단, Apple이 쓰는 확장 OID 포함)을
 * 테스트가 직접 발급하고, 게이트웨이가 그 루트를 신뢰하도록 `trust()`만 갈아 끼운다. 서명 검증·체인 검증·
 * 번들 ID·환경 대조는 운영과 같은 코드가 한다. 인증서 폐기 확인(OCSP)만 끈다 — 물어볼 Apple 서버가 없다.
 */
const BUNDLE_ID = 'com.runtime.ear';
const APP_APPLE_ID = 6807708636;

/** Apple이 App Store 서명 인증서에 넣는 확장 OID — 라이브러리가 있는지 확인한다 */
const OID_APPLE_INTERMEDIATE = '1.2.840.113635.100.6.2.1';
const OID_APPLE_LEAF = '1.2.840.113635.100.6.11.1';

type KeyPair = ReturnType<typeof KEYUTIL.generateKeypair>;

interface Chain {
  /** JWS 헤더 `x5c` — [말단, 중간, 루트] (base64 DER) */
  x5c: string[];
  rootDer: Buffer;
  leafPrivateKeyPem: string;
}

function issue(
  subject: string,
  issuer: string,
  issuerKey: KeyPair,
  key: KeyPair,
  ext: { extname: string; [key: string]: unknown }[],
  serial: number,
): Buffer {
  const certificate = new KJUR.asn1.x509.Certificate({
    version: 3,
    serial: { int: serial },
    issuer: { str: issuer },
    subject: { str: subject },
    notbefore: '250101000000Z',
    notafter: '350101000000Z',
    sbjpubkey: key.pubKeyObj,
    ext,
    sigalg: 'SHA256withECDSA',
    cakey: issuerKey.prvKeyObj,
  });

  return Buffer.from(certificate.getEncodedHex(), 'hex');
}

function buildChain(name: string): Chain {
  const rootKey = KEYUTIL.generateKeypair('EC', 'secp256r1');
  const intermediateKey = KEYUTIL.generateKeypair('EC', 'secp256r1');
  const leafKey = KEYUTIL.generateKeypair('EC', 'secp256r1');
  const ca = { extname: 'basicConstraints', cA: true, critical: true };
  const rootSubject = `/CN=${name} Root`;
  const intermediateSubject = `/CN=${name} Intermediate`;

  const rootDer = issue(rootSubject, rootSubject, rootKey, rootKey, [ca], 1);
  const intermediateDer = issue(
    intermediateSubject,
    rootSubject,
    rootKey,
    intermediateKey,
    [ca, { extname: OID_APPLE_INTERMEDIATE, extn: '0500' }],
    2,
  );
  const leafDer = issue(
    `/CN=${name} Leaf`,
    intermediateSubject,
    intermediateKey,
    leafKey,
    [{ extname: OID_APPLE_LEAF, extn: '0500' }],
    3,
  );

  return {
    x5c: [leafDer, intermediateDer, rootDer].map((der) =>
      der.toString('base64'),
    ),
    rootDer,
    leafPrivateKeyPem: KEYUTIL.getPEM(leafKey.prvKeyObj, 'PKCS8PRV'),
  };
}

function sign(chain: Chain, payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const signingInput = `${encode({ alg: 'ES256', x5c: chain.x5c })}.${encode(payload)}`;
  const signature = createSign('sha256')
    .update(signingInput)
    .sign({ key: chain.leafPrivateKeyPem, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');

  return `${signingInput}.${signature}`;
}

const PURCHASED_AT = Date.parse('2026-10-01T00:00:00Z');
const EXPIRES_AT = Date.parse('2026-11-01T00:00:00Z');

function transactionPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    bundleId: BUNDLE_ID,
    environment: 'Sandbox',
    type: 'Auto-Renewable Subscription',
    originalTransactionId: '2000000000000001',
    transactionId: '2000000000000002',
    productId: 'com.runtime.ear.subscription.pro.monthly',
    originalPurchaseDate: PURCHASED_AT,
    purchaseDate: PURCHASED_AT,
    expiresDate: EXPIRES_AT,
    signedDate: PURCHASED_AT,
    appAccountToken: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    ...overrides,
  };
}

function buildGateway(
  chain: Chain,
  env: Partial<Record<keyof EnvironmentVariables, string>>,
): AppleAppStoreGateway {
  const config = {
    get: (key: keyof EnvironmentVariables) => env[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;

  return new (class extends AppleAppStoreGateway {
    protected override trust() {
      return { rootCertificates: [chain.rootDer], enableOnlineChecks: false };
    }
  })(config);
}

const SANDBOX_ENV = {
  APP_STORE_BUNDLE_ID: BUNDLE_ID,
  APP_STORE_ENVIRONMENTS: 'Sandbox',
};

async function expectRejected(
  work: Promise<unknown>,
  kind: 'invalid' | 'unavailable',
  reason?: string,
): Promise<void> {
  const error = await work.then(
    () => {
      throw new Error('expected rejection but resolved');
    },
    (thrown: unknown) => thrown,
  );

  expect(error).toBeInstanceOf(AppStoreVerificationError);
  expect((error as AppStoreVerificationError).kind).toBe(kind);
  if (reason) {
    expect((error as AppStoreVerificationError).reason).toBe(reason);
  }
}

describe('AppleAppStoreGateway', () => {
  const chain = buildChain('Trusted');
  const foreignChain = buildChain('Foreign');

  describe('구성', () => {
    it.each([
      ['번들 ID가 없으면', { APP_STORE_ENVIRONMENTS: 'Sandbox' }],
      ['받는 환경이 없으면', { APP_STORE_BUNDLE_ID: BUNDLE_ID }],
      [
        '운영 환경을 받는데 앱의 Apple ID가 없으면',
        {
          APP_STORE_BUNDLE_ID: BUNDLE_ID,
          APP_STORE_ENVIRONMENTS: 'Production',
        },
      ],
    ])('%s 꺼져 있고 어떤 거래도 받지 않는다', async (_label, env) => {
      const gateway = buildGateway(chain, env);

      expect(gateway.isEnabled()).toBe(false);
      await expectRejected(
        gateway.verifyTransaction(sign(chain, transactionPayload())),
        'invalid',
        'not_configured',
      );
    });

    it('App Store Server API 키가 없으면 상태 조회만 꺼진다 — 서명 검증은 된다', () => {
      const gateway = buildGateway(chain, SANDBOX_ENV);

      expect(gateway.isEnabled()).toBe(true);
      expect(gateway.canFetchStatus(SubscriptionEnvironment.SANDBOX)).toBe(
        false,
      );
    });

    it('키 셋이 다 있으면 받는 환경에 한해 상태를 조회할 수 있다', () => {
      const gateway = buildGateway(chain, {
        ...SANDBOX_ENV,
        APP_STORE_ISSUER_ID: 'issuer',
        APP_STORE_KEY_ID: 'key',
        APP_STORE_PRIVATE_KEY_BASE64: Buffer.from('pem').toString('base64'),
      });

      expect(gateway.canFetchStatus(SubscriptionEnvironment.SANDBOX)).toBe(
        true,
      );
      expect(gateway.canFetchStatus(SubscriptionEnvironment.PRODUCTION)).toBe(
        false,
      );
    });
  });

  describe('거래 검증', () => {
    const gateway = buildGateway(chain, SANDBOX_ENV);

    it('신뢰하는 루트로 서명된 거래를 풀어 우리 의미로 환산한다', async () => {
      const signed = sign(chain, transactionPayload());

      await expect(gateway.verifyTransaction(signed)).resolves.toEqual({
        store: SubscriptionStore.APP_STORE,
        environment: SubscriptionEnvironment.SANDBOX,
        originalTransactionId: '2000000000000001',
        productId: 'com.runtime.ear.subscription.pro.monthly',
        originalPurchasedAt: new Date(PURCHASED_AT),
        purchasedAt: new Date(PURCHASED_AT),
        expiresAt: new Date(EXPIRES_AT),
        revokedAt: null,
        // 계정 토큰은 소문자로 맞춘다 — 결제 의도의 id와 대조한다
        accountToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        receipt: signed,
      });
    });

    it('환불된 거래는 환불 시각을 싣는다', async () => {
      const revokedAt = Date.parse('2026-10-05T00:00:00Z');
      const transaction = await gateway.verifyTransaction(
        sign(chain, transactionPayload({ revocationDate: revokedAt })),
      );

      expect(transaction.revokedAt).toEqual(new Date(revokedAt));
    });

    it('다른 루트로 서명된 거래(위조)는 받지 않는다', async () => {
      await expectRejected(
        gateway.verifyTransaction(sign(foreignChain, transactionPayload())),
        'invalid',
      );
    });

    it('서명 뒤에 내용을 바꾼 거래는 받지 않는다', async () => {
      const [header, , signature] = sign(chain, transactionPayload()).split(
        '.',
      );
      const tampered = Buffer.from(
        JSON.stringify(transactionPayload({ expiresDate: EXPIRES_AT * 2 })),
      ).toString('base64url');

      await expectRejected(
        gateway.verifyTransaction(`${header}.${tampered}.${signature}`),
        'invalid',
      );
    });

    it('다른 앱의 거래는 받지 않는다', async () => {
      await expectRejected(
        gateway.verifyTransaction(
          sign(chain, transactionPayload({ bundleId: 'com.other.app' })),
        ),
        'invalid',
        'INVALID_APP_IDENTIFIER',
      );
    });

    it('이 서버가 받지 않는 환경의 거래는 서명이 맞아도 받지 않는다', async () => {
      await expectRejected(
        gateway.verifyTransaction(
          sign(chain, transactionPayload({ environment: 'Production' })),
        ),
        'invalid',
        'environment_not_allowed',
      );
      await expectRejected(
        gateway.verifyTransaction(
          sign(chain, transactionPayload({ environment: 'Xcode' })),
        ),
        'invalid',
        'environment_not_allowed',
      );
    });

    it('구독이 아닌 거래(만료일 없음)는 받지 않는다', async () => {
      await expectRejected(
        gateway.verifyTransaction(
          sign(chain, transactionPayload({ expiresDate: undefined })),
        ),
        'invalid',
        'not_a_subscription',
      );
    });

    it.each(['', 'not-a-jws', 'a.b', 'a.b.c'])(
      '형식이 깨진 값 %p 은 받지 않는다',
      async (value) => {
        await expectRejected(gateway.verifyTransaction(value), 'invalid');
      },
    );
  });

  describe('운영·샌드박스를 함께 받는 서버', () => {
    const gateway = buildGateway(chain, {
      APP_STORE_BUNDLE_ID: BUNDLE_ID,
      APP_STORE_APP_APPLE_ID: String(APP_APPLE_ID),
      APP_STORE_ENVIRONMENTS: 'Production,Sandbox',
    });

    it('거래에 적힌 환경을 그대로 남긴다 — 시험 결제와 실결제를 가른다', async () => {
      const sandbox = await gateway.verifyTransaction(
        sign(chain, transactionPayload()),
      );
      const production = await gateway.verifyTransaction(
        sign(chain, transactionPayload({ environment: 'Production' })),
      );

      expect(sandbox.environment).toBe(SubscriptionEnvironment.SANDBOX);
      expect(production.environment).toBe(SubscriptionEnvironment.PRODUCTION);
    });
  });

  describe('서버 알림 검증', () => {
    const gateway = buildGateway(chain, SANDBOX_ENV);

    function notificationPayload(
      data: Record<string, unknown>,
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return {
        notificationType: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'AUTO_RENEW_DISABLED',
        notificationUUID: '11111111-2222-4333-8444-555555555555',
        version: '2.0',
        signedDate: PURCHASED_AT + 1000,
        data: { bundleId: BUNDLE_ID, environment: 'Sandbox', ...data },
        ...overrides,
      };
    }

    it('봉투와 안쪽 거래·갱신 정보를 모두 검증해 풀어낸다', async () => {
      const graceEnd = Date.parse('2026-11-17T00:00:00Z');
      const signedPayload = sign(
        chain,
        notificationPayload({
          signedTransactionInfo: sign(chain, transactionPayload()),
          signedRenewalInfo: sign(chain, {
            environment: 'Sandbox',
            originalTransactionId: '2000000000000001',
            productId: 'com.runtime.ear.subscription.pro.monthly',
            autoRenewProductId: 'com.runtime.ear.subscription.daily.monthly',
            autoRenewStatus: 0,
            gracePeriodExpiresDate: graceEnd,
            signedDate: PURCHASED_AT,
          }),
        }),
      );

      await expect(gateway.verifyNotification(signedPayload)).resolves.toEqual({
        id: '11111111-2222-4333-8444-555555555555',
        type: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'AUTO_RENEW_DISABLED',
        signedAt: new Date(PURCHASED_AT + 1000),
        environment: SubscriptionEnvironment.SANDBOX,
        transaction: expect.objectContaining({
          originalTransactionId: '2000000000000001',
          expiresAt: new Date(EXPIRES_AT),
        }) as unknown,
        renewal: {
          isAutoRenew: false,
          autoRenewProductId: 'com.runtime.ear.subscription.daily.monthly',
          gracePeriodExpiresAt: new Date(graceEnd),
        },
      });
    });

    it('거래가 없는 알림(TEST)도 받는다', async () => {
      const notification = await gateway.verifyNotification(
        sign(
          chain,
          notificationPayload(
            {},
            { notificationType: 'TEST', subtype: undefined },
          ),
        ),
      );

      expect(notification).toMatchObject({
        type: 'TEST',
        subtype: null,
        transaction: null,
        renewal: null,
      });
    });

    it.each([
      [
        '구독 일괄 연장 요약(summary)',
        {
          notificationType: 'RENEWAL_EXTENSION',
          subtype: 'SUMMARY',
          summary: { bundleId: BUNDLE_ID, environment: 'Sandbox' },
        },
      ],
      [
        '동의 철회(appData)',
        {
          notificationType: 'RESCIND_CONSENT',
          subtype: undefined,
          appData: { bundleId: BUNDLE_ID, environment: 'Sandbox' },
        },
      ],
      [
        '외부 구매 토큰(externalPurchaseToken — 환경 필드가 없어 식별자 접두사로 가른다)',
        {
          notificationType: 'EXTERNAL_PURCHASE_TOKEN',
          subtype: 'UNREPORTED',
          externalPurchaseToken: {
            bundleId: BUNDLE_ID,
            externalPurchaseId: 'SANDBOX_11111111-2222-4333-8444-555555555555',
          },
        },
      ],
    ])(
      'data 가 없는 알림 — %s 도 환경을 그 본문에서 읽어 받는다(400으로 돌려보내면 Apple이 며칠간 재전송한다)',
      async (_label, body) => {
        const envelope = notificationPayload({}, body);
        delete envelope.data;

        const notification = await gateway.verifyNotification(
          sign(chain, envelope),
        );

        expect(notification).toMatchObject({
          type: body.notificationType,
          environment: SubscriptionEnvironment.SANDBOX,
          transaction: null,
          renewal: null,
        });
      },
    );

    it('data 가 없는 알림도 받지 않는 환경이면 거절한다', async () => {
      const envelope = notificationPayload(
        {},
        {
          notificationType: 'RENEWAL_EXTENSION',
          subtype: 'SUMMARY',
          summary: { bundleId: BUNDLE_ID, environment: 'Production' },
        },
      );
      delete envelope.data;

      await expectRejected(
        gateway.verifyNotification(sign(chain, envelope)),
        'invalid',
        'environment_not_allowed',
      );
    });

    it('봉투의 서명이 맞아도 안쪽 거래가 다른 루트로 서명됐으면 받지 않는다', async () => {
      await expectRejected(
        gateway.verifyNotification(
          sign(
            chain,
            notificationPayload({
              signedTransactionInfo: sign(foreignChain, transactionPayload()),
            }),
          ),
        ),
        'invalid',
      );
    });

    it('위조된 알림과 다른 앱의 알림은 받지 않는다', async () => {
      await expectRejected(
        gateway.verifyNotification(sign(foreignChain, notificationPayload({}))),
        'invalid',
      );
      await expectRejected(
        gateway.verifyNotification(
          sign(chain, notificationPayload({ bundleId: 'com.other.app' })),
        ),
        'invalid',
        'INVALID_APP_IDENTIFIER',
      );
    });
  });
});
