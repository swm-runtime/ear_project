import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { SubscriptionEnvironment } from '@/modules/subscription/subscription.enum';

import {
  PlayNotification,
  PlayPurchase,
  PlayPushEnvelope,
  PlayStoreError,
  PlayStoreGateway,
  PlaySubscriptionState,
} from './play-store.gateway';

const API_BASE =
  'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';

/** Google이 "그 구매 토큰을 모른다"고 답하는 HTTP 상태 — 형식 오류(400)·없음(404)·만료돼 지워짐(410) */
const UNKNOWN_TOKEN_STATUSES: readonly number[] = [400, 404, 410];
/** 우리 자격증명이 거부된 상태 — 서비스 계정 키·권한 문제다. 사용자 잘못이 아니라 재시도 대상으로 답한다 */
const CREDENTIAL_STATUSES: readonly number[] = [401, 403];

const STATE_BY_GOOGLE: Readonly<
  Record<string, PlaySubscriptionState | undefined>
> = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_CANCELED: 'canceled',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
  SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_PENDING: 'pending',
  // 결제 대기 중이던 구매가 취소됐다 — 구독이 된 적이 없다
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
};

/** `voidedPurchaseNotification.productType` — 1이 구독이다(2는 일회성 상품) */
const VOIDED_PRODUCT_TYPE_SUBSCRIPTION = 1;

/** Google의 OIDC 토큰 발급자 — 두 표기가 다 쓰인다 */
const GOOGLE_ISSUERS: readonly string[] = [
  'https://accounts.google.com',
  'accounts.google.com',
];

/** `purchases.subscriptionsv2.get` 응답에서 우리가 읽는 필드 */
interface SubscriptionPurchaseV2 {
  startTime?: string;
  subscriptionState?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: {
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    deferredItemReplacement?: { productId?: string };
  }[];
  /** 라이선스 테스터의 시험 구매에만 있다(내용 없는 객체) */
  testPurchase?: object;
}

/** RTDN 본문(`message.data`를 base64 해독한 JSON) */
interface DeveloperNotification {
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    notificationType?: number;
    purchaseToken?: string;
  };
  voidedPurchaseNotification?: { purchaseToken?: string; productType?: number };
  testNotification?: object;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/** `protected` 이음매가 받는 HTTP 요청·응답 — 테스트가 네트워크 없이 갈아 끼운다 */
export interface GoogleRequest {
  method: 'GET' | 'POST';
  url: string;
}

export interface OidcClaims {
  iss?: string;
  email?: string;
  email_verified?: boolean;
}

/** HTTP 상태를 실은 오류 — 이음매 구현이 Google의 응답 상태를 이 모양으로 올린다 */
export class GoogleHttpError extends Error {
  constructor(readonly status: number | null) {
    super(`google api responded ${status ?? 'no response'}`);
    this.name = 'GoogleHttpError';
  }
}

type GoogleAuthModule = typeof import('google-auth-library');

/**
 * Google Play Developer API로 구매를 검증하는 구현(`subscription-api.md` 4.7 · 7장).
 *
 * App Store와 달리 **서명만으로 검증이 끝나지 않는다** — 구매 토큰은 불투명한 문자열이라 매번 Google에 물어야
 * 한다. 그래서 Google API가 느리거나 죽으면 영수증 제출이 `SUBSCRIPTION_STORE_UNAVAILABLE`(재시도)로 답한다.
 *
 * `google-auth-library`는 처음 쓸 때 로드한다 — Android 결제를 켜지 않은 서버(구성 없음)가 그 모듈을 들고 있을
 * 이유가 없다(`Ga4Service`의 지연 로드와 같은 이유).
 */
@Injectable()
export class GooglePlayStoreGateway extends PlayStoreGateway {
  private readonly logger = new Logger(GooglePlayStoreGateway.name);

  private readonly packageName: string;
  private readonly serviceAccount: ServiceAccountKey | null;
  private readonly pushAudience: string;
  private readonly pushServiceAccount: string;

  private authModule: GoogleAuthModule | null = null;
  private apiClient: InstanceType<GoogleAuthModule['JWT']> | null = null;
  private oidcClient: InstanceType<GoogleAuthModule['OAuth2Client']> | null =
    null;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    super();

    const read = (key: keyof EnvironmentVariables): string =>
      String(configService.get(key, { infer: true }) ?? '').trim();

    this.packageName = read('GOOGLE_PLAY_PACKAGE_NAME');
    this.serviceAccount = parseServiceAccount(
      read('GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64'),
    );
    this.pushAudience = read('GOOGLE_PLAY_PUBSUB_AUDIENCE');
    this.pushServiceAccount = read('GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT');
  }

  isEnabled(): boolean {
    return this.packageName !== '' && this.serviceAccount !== null;
  }

  async fetchPurchase(purchaseToken: string): Promise<PlayPurchase | null> {
    this.assertEnabled();

    let body: SubscriptionPurchaseV2;

    try {
      body = (await this.requestGoogle({
        method: 'GET',
        url: `${this.appUrl()}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      })) as SubscriptionPurchaseV2;
    } catch (error) {
      const status = statusOf(error);

      if (status !== null && UNKNOWN_TOKEN_STATUSES.includes(status)) {
        return null;
      }

      throw this.unavailable('purchase_query_failed', status);
    }

    return toPlayPurchase(body, purchaseToken);
  }

  async acknowledge(productId: string, purchaseToken: string): Promise<void> {
    this.assertEnabled();

    try {
      await this.requestGoogle({
        method: 'POST',
        url: `${this.appUrl()}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      });
    } catch (error) {
      throw this.unavailable('acknowledge_failed', statusOf(error));
    }
  }

  async verifyNotification(
    authorization: string | undefined,
    envelope: PlayPushEnvelope,
  ): Promise<PlayNotification> {
    this.assertEnabled();

    // 누가 보낸 요청인지 확인할 구성이 없으면 어떤 알림도 받지 않는다 — 검증 없이 본문을 믿지 않는다
    if (this.pushAudience === '' || this.pushServiceAccount === '') {
      throw new PlayStoreError('invalid', 'push_not_configured');
    }

    const idToken = /^Bearer (.+)$/i.exec(authorization ?? '')?.[1];

    if (!idToken) {
      throw new PlayStoreError('invalid', 'push_token_missing');
    }

    let claims: OidcClaims;

    try {
      claims = await this.verifyIdToken(idToken, this.pushAudience);
    } catch (error) {
      // 서명·만료·대상 불일치. Google 공개키를 받아오지 못한 경우도 여기로 온다 — 구분할 수 없어 거절로 답한다
      // (Pub/Sub이 재전송하므로 일시 장애였다면 다음 시도에서 통과한다)
      // 오류 메시지를 그대로 남기지 않는다 — Google 라이브러리의 메시지에는 토큰 전문이나 토큰 본문(JSON)이
      // 붙어 있다(`Invalid token signature: <JWT>` 등, `convention.md` 8.4)
      this.logger.warn('play push token rejected', {
        reason: classifyIdTokenError(error),
        error_name: error instanceof Error ? error.name : null,
      });
      throw new PlayStoreError('invalid', 'push_token_invalid');
    }

    if (
      !GOOGLE_ISSUERS.includes(claims.iss ?? '') ||
      claims.email_verified !== true ||
      claims.email !== this.pushServiceAccount
    ) {
      throw new PlayStoreError('invalid', 'push_sender_mismatch');
    }

    const notification = decodeNotification(envelope);

    if (notification.packageName !== this.packageName) {
      throw new PlayStoreError('invalid', 'package_mismatch');
    }

    return toPlayNotification(envelope.message.messageId, notification);
  }

  /**
   * Google API 호출 — 서비스 계정으로 서명한 요청을 보내고 본문을 돌려준다. 2xx가 아니면 `GoogleHttpError`.
   * 테스트가 이 메서드를 갈아 끼워 네트워크 없이 응답 해석을 검증한다.
   */
  protected async requestGoogle(request: GoogleRequest): Promise<unknown> {
    const client = this.getApiClient();

    try {
      const response = await client.request<unknown>({
        url: request.url,
        method: request.method,
        ...(request.method === 'POST' ? { data: {} } : {}),
      });

      return response.data;
    } catch (error) {
      throw toGoogleHttpError(error);
    }
  }

  /** Pub/Sub push의 OIDC 토큰 검증 — Google 공개키로 서명·만료·대상(`aud`)을 확인하고 클레임을 돌려준다 */
  protected async verifyIdToken(
    idToken: string,
    audience: string,
  ): Promise<OidcClaims> {
    const ticket = await this.getOidcClient().verifyIdToken({
      idToken,
      audience,
    });

    return ticket.getPayload() ?? {};
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new PlayStoreError('invalid', 'not_configured');
    }
  }

  private appUrl(): string {
    return `${API_BASE}/${encodeURIComponent(this.packageName)}`;
  }

  private unavailable(reason: string, status: number | null): PlayStoreError {
    const isCredentialProblem =
      status !== null && CREDENTIAL_STATUSES.includes(status);

    // 자격증명 거부는 재시도로 풀리지 않는다 — 운영자가 봐야 하므로 error로 남긴다
    this.logger[isCredentialProblem ? 'error' : 'warn'](
      'google play api call failed',
      { reason, http_status: status, credential_problem: isCredentialProblem },
    );

    return new PlayStoreError('unavailable', reason);
  }

  private loadAuthModule(): GoogleAuthModule {
    if (!this.authModule) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드(클래스 주석)
      this.authModule = require('google-auth-library') as GoogleAuthModule;
    }

    return this.authModule;
  }

  private getApiClient(): InstanceType<GoogleAuthModule['JWT']> {
    if (!this.apiClient) {
      const { JWT } = this.loadAuthModule();

      this.apiClient = new JWT({
        email: this.serviceAccount!.client_email,
        key: this.serviceAccount!.private_key,
        scopes: [ANDROID_PUBLISHER_SCOPE],
      });
    }

    return this.apiClient;
  }

  private getOidcClient(): InstanceType<GoogleAuthModule['OAuth2Client']> {
    if (!this.oidcClient) {
      const { OAuth2Client } = this.loadAuthModule();

      this.oidcClient = new OAuth2Client();
    }

    return this.oidcClient;
  }
}

function parseServiceAccount(base64: string): ServiceAccountKey | null {
  if (base64 === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(base64, 'base64').toString('utf8'),
    ) as Partial<ServiceAccountKey>;

    return typeof parsed.client_email === 'string' &&
      typeof parsed.private_key === 'string'
      ? { client_email: parsed.client_email, private_key: parsed.private_key }
      : null;
  } catch {
    // 값이 깨졌으면 꺼진 것으로 본다 — 결제 의도 단계에서 막히고, 기동 요약이 꺼짐을 보여 준다
    return null;
  }
}

/**
 * ID 토큰 검증 실패의 갈래 — **로그에 남겨도 되는 값만** 돌려준다. `google-auth-library`의 오류 메시지는
 * 앞머리가 사유이고 뒤에 토큰 전문·토큰 본문을 붙이므로, 아는 앞머리만 사유 코드로 바꾸고 나머지는 `other`다
 * (메시지를 잘라 쓰지 않는다 — 형식이 바뀌면 토큰이 새어 나간다).
 */
const ID_TOKEN_ERROR_KINDS: readonly (readonly [string, string])[] = [
  ['Wrong number of segments', 'malformed'],
  ["Can't parse token", 'malformed'],
  ['No issue time', 'malformed'],
  ['No expiration time', 'malformed'],
  ['iat field', 'malformed'],
  ['exp field', 'malformed'],
  ['No pem found', 'unknown_key'],
  ['Invalid token signature', 'bad_signature'],
  ['Token used too early', 'not_yet_valid'],
  ['Token used too late', 'expired'],
  ['Expiration time too far', 'expiry_too_far'],
  ['Invalid issuer', 'wrong_issuer'],
  ['Wrong recipient', 'wrong_audience'],
];

export function classifyIdTokenError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';

  return (
    ID_TOKEN_ERROR_KINDS.find(([prefix]) => message.startsWith(prefix))?.[1] ??
    'other'
  );
}

function statusOf(error: unknown): number | null {
  return error instanceof GoogleHttpError ? error.status : null;
}

/** 서비스 계정 인증이 실패했을 때 올리는 상태 — 호출부가 "우리 자격증명 문제"로 다룬다 */
const CREDENTIAL_FAILURE_STATUS = 401;

/**
 * `google-auth-library`(gaxios)가 던진 오류를 HTTP 상태로 옮긴다. 응답이 없었으면(네트워크) `null`.
 *
 * **어느 주소가 답한 오류인지 본다.** 서비스 계정이 틀리면 Play API를 부르기도 전에 토큰 발급 주소
 * (`oauth2.googleapis.com/token`)가 **400**(`invalid_grant`)으로 답한다. 그 400을 Play API의 400("모르는 구매
 * 토큰")과 같이 다루면, 우리 자격증명이 틀렸을 뿐인데 결제한 사용자에게 "구독을 확인할 수 없어요"라고 답하고
 * 클라이언트가 재시도도 하지 않는다. Play API가 아닌 주소의 오류는 전부 자격증명 실패로 올린다.
 */
export function toGoogleHttpError(error: unknown): GoogleHttpError {
  const candidate = error as {
    status?: unknown;
    config?: { url?: unknown };
    response?: { status?: unknown };
  } | null;
  const status = candidate?.response?.status ?? candidate?.status;
  const url = candidate?.config?.url;

  if (typeof status !== 'number') {
    return new GoogleHttpError(null);
  }

  // `config.url`은 문자열일 수도 URL 객체일 수도 있다 — 템플릿으로 문자열화한다
  const answeredByPlayApi =
    (typeof url === 'string' || url instanceof URL) &&
    `${url.toString()}`.startsWith(API_BASE);

  return new GoogleHttpError(
    answeredByPlayApi ? status : CREDENTIAL_FAILURE_STATUS,
  );
}

function toPlayPurchase(
  body: SubscriptionPurchaseV2,
  purchaseToken: string,
): PlayPurchase | null {
  const state = STATE_BY_GOOGLE[body.subscriptionState ?? ''];
  // 한 구매에 상품이 여러 줄일 수 있지만(부가 상품) 이어의 구독은 한 줄이다 — 만료가 가장 늦은 줄을 본다
  const item = [...(body.lineItems ?? [])]
    .filter((line) => line.productId && line.expiryTime)
    .sort((a, b) => Date.parse(b.expiryTime!) - Date.parse(a.expiryTime!))[0];

  // 상태를 모르거나 구독 줄이 없으면 구독으로 다룰 수 없다 — "모르는 토큰"과 같이 답한다
  if (state === undefined || !item || !body.startTime) {
    return null;
  }

  return {
    purchaseToken,
    linkedPurchaseToken: body.linkedPurchaseToken ?? null,
    productId: item.productId!,
    state,
    startedAt: new Date(body.startTime),
    expiresAt: new Date(item.expiryTime!),
    isAutoRenew: item.autoRenewingPlan?.autoRenewEnabled === true,
    pendingProductId: item.deferredItemReplacement?.productId ?? null,
    // UUID는 대소문자를 가리지 않는다 — 결제 의도의 `id`(소문자)와 맞춘다
    accountToken:
      body.externalAccountIdentifiers?.obfuscatedExternalAccountId?.toLowerCase() ??
      null,
    environment:
      body.testPurchase !== undefined
        ? SubscriptionEnvironment.SANDBOX
        : SubscriptionEnvironment.PRODUCTION,
    needsAcknowledge:
      body.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
  };
}

function decodeNotification(envelope: PlayPushEnvelope): DeveloperNotification {
  try {
    return JSON.parse(
      Buffer.from(envelope.message.data, 'base64').toString('utf8'),
    ) as DeveloperNotification;
  } catch {
    throw new PlayStoreError('invalid', 'notification_malformed');
  }
}

function toPlayNotification(
  messageId: string,
  notification: DeveloperNotification,
): PlayNotification {
  const eventAt = new Date(Number(notification.eventTimeMillis ?? Date.now()));
  const subscription = notification.subscriptionNotification;
  const voided = notification.voidedPurchaseNotification;

  if (subscription?.purchaseToken) {
    return {
      id: messageId,
      kind: 'subscription',
      type: subscription.notificationType ?? null,
      purchaseToken: subscription.purchaseToken,
      eventAt,
    };
  }

  if (
    voided?.purchaseToken &&
    voided.productType === VOIDED_PRODUCT_TYPE_SUBSCRIPTION
  ) {
    return {
      id: messageId,
      kind: 'voided',
      type: null,
      purchaseToken: voided.purchaseToken,
      eventAt,
    };
  }

  return {
    id: messageId,
    kind: notification.testNotification !== undefined ? 'test' : 'other',
    type: null,
    purchaseToken: null,
    eventAt,
  };
}
