import {
  APIException,
  AppStoreServerAPIClient,
  Environment,
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  SignedDataVerifier,
  Status,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { StoreSubscriptionStatus } from '@/modules/subscription/policies/store-state.policy';
import {
  SubscriptionEnvironment,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';
import {
  StoreRenewalInfo,
  StoreTransaction,
} from '@/modules/subscription/subscription.types';

import {
  AppStoreGateway,
  AppStoreNotification,
  AppStoreSubscriptionStatus,
  AppStoreVerificationError,
} from './app-store.gateway';
import { APPLE_ROOT_CERTIFICATES } from './apple-root-certificates';

const ENVIRONMENT_BY_APPLE: Readonly<
  Record<string, SubscriptionEnvironment | undefined>
> = {
  [Environment.PRODUCTION]: SubscriptionEnvironment.PRODUCTION,
  [Environment.SANDBOX]: SubscriptionEnvironment.SANDBOX,
};

const APPLE_BY_ENVIRONMENT: Readonly<
  Record<SubscriptionEnvironment, Environment>
> = {
  [SubscriptionEnvironment.PRODUCTION]: Environment.PRODUCTION,
  [SubscriptionEnvironment.SANDBOX]: Environment.SANDBOX,
};

/** Apple의 구독 상태 번호 → 우리 의미(`subscription-api.md` 4.2 만료 보정) */
const STATUS_BY_APPLE: Readonly<
  Record<number, StoreSubscriptionStatus | undefined>
> = {
  [Status.ACTIVE]: 'active',
  [Status.EXPIRED]: 'expired',
  [Status.BILLING_RETRY]: 'billing_retry',
  [Status.BILLING_GRACE_PERIOD]: 'grace',
  [Status.REVOKED]: 'revoked',
};

/** App Store Server API가 "그 거래를 모른다"고 답하는 HTTP 상태 */
const HTTP_NOT_FOUND = 404;

/**
 * Apple 공식 라이브러리(`@apple/app-store-server-library`)로 검증하는 구현.
 *
 * 서명 검증은 JWS의 인증서 체인을 Apple 루트(G3)까지 따라가고, 인증서 폐기 여부(OCSP)를 Apple에 확인한다.
 * 그 확인이 일시적으로 실패하면 "위조"가 아니라 "지금은 확인할 수 없음"이다 — 둘을 가른다.
 */
@Injectable()
export class AppleAppStoreGateway extends AppStoreGateway {
  private readonly logger = new Logger(AppleAppStoreGateway.name);

  private readonly bundleId: string;
  private readonly appAppleId: number | undefined;
  private readonly environments: ReadonlySet<SubscriptionEnvironment>;
  private readonly apiCredentials: {
    issuerId: string;
    keyId: string;
    privateKey: string;
  } | null;

  private readonly verifiers = new Map<
    SubscriptionEnvironment,
    SignedDataVerifier
  >();
  private readonly apiClients = new Map<
    SubscriptionEnvironment,
    AppStoreServerAPIClient
  >();

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    super();

    const read = (key: keyof EnvironmentVariables): string =>
      String(configService.get(key, { infer: true }) ?? '').trim();

    this.bundleId = read('APP_STORE_BUNDLE_ID');
    const appAppleId = read('APP_STORE_APP_APPLE_ID');
    this.appAppleId = appAppleId === '' ? undefined : Number(appAppleId);
    this.environments = new Set(
      read('APP_STORE_ENVIRONMENTS')
        .split(',')
        .map((value) => ENVIRONMENT_BY_APPLE[value.trim()])
        .filter(
          (value): value is SubscriptionEnvironment => value !== undefined,
        ),
    );

    const issuerId = read('APP_STORE_ISSUER_ID');
    const keyId = read('APP_STORE_KEY_ID');
    const privateKeyBase64 = read('APP_STORE_PRIVATE_KEY_BASE64');
    this.apiCredentials =
      issuerId !== '' && keyId !== '' && privateKeyBase64 !== ''
        ? {
            issuerId,
            keyId,
            privateKey: Buffer.from(privateKeyBase64, 'base64').toString(
              'utf8',
            ),
          }
        : null;
  }

  isEnabled(): boolean {
    if (this.bundleId === '' || this.environments.size === 0) {
      return false;
    }

    // 운영 환경의 서명은 앱의 Apple ID까지 대조한다 — 없으면 검증 자체가 실패하므로 꺼진 것으로 본다
    return !(
      this.environments.has(SubscriptionEnvironment.PRODUCTION) &&
      this.appAppleId === undefined
    );
  }

  async verifyTransaction(
    signedTransaction: string,
  ): Promise<StoreTransaction> {
    const environment = this.resolveEnvironment(
      peekEnvironment(signedTransaction, (payload) => payload.environment),
    );
    const payload = await this.runVerification(() =>
      this.verifier(environment).verifyAndDecodeTransaction(signedTransaction),
    );

    return toStoreTransaction(payload, environment, signedTransaction);
  }

  async verifyNotification(
    signedPayload: string,
  ): Promise<AppStoreNotification> {
    const environment = this.resolveEnvironment(
      peekEnvironment(
        signedPayload,
        (payload) =>
          (payload.data as { environment?: unknown } | undefined)?.environment,
      ),
    );
    const verifier = this.verifier(environment);
    const payload = await this.runVerification(() =>
      verifier.verifyAndDecodeNotification(signedPayload),
    );

    if (!payload.notificationUUID || !payload.notificationType) {
      throw new AppStoreVerificationError('invalid', 'notification_malformed');
    }

    const signedTransaction = payload.data?.signedTransactionInfo;
    const signedRenewal = payload.data?.signedRenewalInfo;

    // 안쪽 두 서명도 따로 검증한다 — 바깥 봉투의 서명은 안쪽 값을 보증하지 않는다
    const transaction = signedTransaction
      ? toStoreTransaction(
          await this.runVerification(() =>
            verifier.verifyAndDecodeTransaction(signedTransaction),
          ),
          environment,
          signedTransaction,
        )
      : null;
    const renewal = signedRenewal
      ? toRenewalInfo(
          await this.runVerification(() =>
            verifier.verifyAndDecodeRenewalInfo(signedRenewal),
          ),
        )
      : null;

    return {
      id: payload.notificationUUID,
      type: payload.notificationType,
      subtype: payload.subtype ?? null,
      signedAt: new Date(payload.signedDate ?? Date.now()),
      environment,
      transaction,
      renewal,
    };
  }

  canFetchStatus(environment: SubscriptionEnvironment): boolean {
    return (
      this.isEnabled() &&
      this.apiCredentials !== null &&
      this.environments.has(environment)
    );
  }

  async fetchStatus(
    originalTransactionId: string,
    environment: SubscriptionEnvironment,
  ): Promise<AppStoreSubscriptionStatus | null> {
    const client = this.apiClient(environment);
    const verifier = this.verifier(environment);

    let response;

    try {
      response = await client.getAllSubscriptionStatuses(originalTransactionId);
    } catch (error) {
      if (
        error instanceof APIException &&
        error.httpStatusCode === HTTP_NOT_FOUND
      ) {
        return null;
      }

      this.logger.warn('app store status query failed', {
        http_status:
          error instanceof APIException ? error.httpStatusCode : null,
        api_error: error instanceof APIException ? error.apiError : null,
      });
      throw new AppStoreVerificationError('unavailable', 'status_query_failed');
    }

    const item = (response.data ?? [])
      .flatMap((group) => group.lastTransactions ?? [])
      .find(
        (candidate) =>
          candidate.originalTransactionId === originalTransactionId,
      );
    const signedTransaction = item?.signedTransactionInfo;
    const status =
      item?.status === undefined ? undefined : STATUS_BY_APPLE[item.status];

    if (!item || !signedTransaction || status === undefined) {
      return null;
    }

    const signedRenewal = item.signedRenewalInfo;

    return {
      status,
      transaction: toStoreTransaction(
        await this.runVerification(() =>
          verifier.verifyAndDecodeTransaction(signedTransaction),
        ),
        environment,
        signedTransaction,
      ),
      renewal: signedRenewal
        ? toRenewalInfo(
            await this.runVerification(() =>
              verifier.verifyAndDecodeRenewalInfo(signedRenewal),
            ),
          )
        : null,
    };
  }

  /** 서명에 적힌 환경이 이 서버가 받는 환경인가(`subscription-api.md` 7장 "환경 분리") */
  private resolveEnvironment(
    appleEnvironment: unknown,
  ): SubscriptionEnvironment {
    if (!this.isEnabled()) {
      throw new AppStoreVerificationError('invalid', 'not_configured');
    }

    const environment =
      typeof appleEnvironment === 'string'
        ? ENVIRONMENT_BY_APPLE[appleEnvironment]
        : undefined;

    if (environment === undefined || !this.environments.has(environment)) {
      throw new AppStoreVerificationError('invalid', 'environment_not_allowed');
    }

    return environment;
  }

  /**
   * 서명을 무엇에 대해 검증하는가 — Apple 루트와, 인증서 폐기 확인(OCSP).
   *
   * 폐기 확인을 켠다: 유출돼 폐기된 인증서로 서명된 거래를 받지 않는다. Apple에 묻는 네트워크 호출이지만
   * 라이브러리가 인증서 체인별로 결과를 캐시해, 매 요청이 기다리지는 않는다.
   *
   * 메서드로 뺀 이유는 테스트다 — 진짜 Apple 서명은 테스트에서 만들 수 없어, 테스트가 자체 발급한 루트로
   * 같은 검증 코드를 통과시킨다(그 루트의 인증서에는 폐기 확인 주소가 없다).
   */
  protected trust(): {
    rootCertificates: Buffer[];
    enableOnlineChecks: boolean;
  } {
    return {
      rootCertificates: APPLE_ROOT_CERTIFICATES,
      enableOnlineChecks: true,
    };
  }

  private verifier(environment: SubscriptionEnvironment): SignedDataVerifier {
    let verifier = this.verifiers.get(environment);

    if (!verifier) {
      const trust = this.trust();

      verifier = new SignedDataVerifier(
        trust.rootCertificates,
        trust.enableOnlineChecks,
        APPLE_BY_ENVIRONMENT[environment],
        this.bundleId,
        this.appAppleId,
      );
      this.verifiers.set(environment, verifier);
    }

    return verifier;
  }

  private apiClient(
    environment: SubscriptionEnvironment,
  ): AppStoreServerAPIClient {
    if (!this.apiCredentials) {
      throw new AppStoreVerificationError('unavailable', 'api_not_configured');
    }

    let client = this.apiClients.get(environment);

    if (!client) {
      client = new AppStoreServerAPIClient(
        this.apiCredentials.privateKey,
        this.apiCredentials.keyId,
        this.apiCredentials.issuerId,
        this.bundleId,
        APPLE_BY_ENVIRONMENT[environment],
      );
      this.apiClients.set(environment, client);
    }

    return client;
  }

  private async runVerification<T>(verify: () => Promise<T>): Promise<T> {
    try {
      return await verify();
    } catch (error) {
      if (error instanceof AppStoreVerificationError) {
        throw error;
      }

      if (error instanceof VerificationException) {
        throw new AppStoreVerificationError(
          error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE
            ? 'unavailable'
            : 'invalid',
          VerificationStatus[error.status] ?? 'VERIFICATION_FAILURE',
        );
      }

      // 라이브러리가 모르는 형식(깨진 JWS 등)에서 던지는 일반 오류 — 다시 보내도 같다
      throw new AppStoreVerificationError('invalid', 'malformed');
    }
  }
}

/**
 * 서명 검증 **전에** 페이로드의 환경만 읽는다 — 어느 환경의 검증기로 검증할지 고르기 위해서다.
 * 여기서 읽은 값은 믿지 않는다. 검증기가 같은 값을 다시 대조하므로, 속여 적으면 검증에서 떨어진다.
 */
function peekEnvironment(
  jws: string,
  pick: (payload: Record<string, unknown>) => unknown,
): unknown {
  const segments = jws.split('.');

  if (segments.length !== 3) {
    throw new AppStoreVerificationError('invalid', 'malformed');
  }

  try {
    return pick(
      JSON.parse(
        Buffer.from(segments[1], 'base64url').toString('utf8'),
      ) as Record<string, unknown>,
    );
  } catch {
    throw new AppStoreVerificationError('invalid', 'malformed');
  }
}

function toStoreTransaction(
  payload: JWSTransactionDecodedPayload,
  environment: SubscriptionEnvironment,
  signedTransaction: string,
): StoreTransaction {
  const {
    originalTransactionId,
    productId,
    purchaseDate,
    originalPurchaseDate,
    expiresDate,
  } = payload;

  // 자동 갱신 구독이 아닌 거래(소모품 등)에는 만료일이 없다 — 구독으로 받지 않는다
  if (
    !originalTransactionId ||
    !productId ||
    purchaseDate === undefined ||
    expiresDate === undefined
  ) {
    throw new AppStoreVerificationError('invalid', 'not_a_subscription');
  }

  return {
    store: SubscriptionStore.APP_STORE,
    environment,
    originalTransactionId,
    productId,
    originalPurchasedAt: new Date(originalPurchaseDate ?? purchaseDate),
    purchasedAt: new Date(purchaseDate),
    expiresAt: new Date(expiresDate),
    revokedAt:
      payload.revocationDate === undefined
        ? null
        : new Date(payload.revocationDate),
    // UUID는 대소문자를 가리지 않는다 — 의도 행의 `id`(소문자)와 맞춘다
    accountToken: payload.appAccountToken?.toLowerCase() ?? null,
    receipt: signedTransaction,
  };
}

/** Apple `autoRenewStatus` — 1이 켜짐 */
const AUTO_RENEW_ON = 1;

function toRenewalInfo(
  payload: JWSRenewalInfoDecodedPayload,
): StoreRenewalInfo {
  return {
    isAutoRenew: payload.autoRenewStatus === AUTO_RENEW_ON,
    autoRenewProductId: payload.autoRenewProductId ?? null,
    gracePeriodExpiresAt:
      payload.gracePeriodExpiresDate === undefined
        ? null
        : new Date(payload.gracePeriodExpiresDate),
  };
}
