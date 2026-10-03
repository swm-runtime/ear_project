import { SubscriptionEnvironment } from '@/modules/subscription/subscription.enum';

/**
 * 검증 실패의 두 갈래(`AppStoreVerificationError`와 같은 구분).
 *
 * - `invalid`: Google이 그 토큰·요청을 모르거나 거부한다. 다시 보내도 같다 → `SUBSCRIPTION_RECEIPT_INVALID`
 * - `unavailable`: Google API가 일시적으로 답하지 못했거나 우리 자격증명이 거부됐다 → `SUBSCRIPTION_STORE_UNAVAILABLE`
 */
export type PlayStoreFailureKind = 'invalid' | 'unavailable';

export class PlayStoreError extends Error {
  constructor(
    readonly kind: PlayStoreFailureKind,
    /** 로그용 사유. 구매 토큰을 담지 않는다 */
    readonly reason: string,
  ) {
    super(`play store ${kind}: ${reason}`);
    this.name = 'PlayStoreError';
  }
}

/**
 * Google Play가 답한 구독의 지금 상태(`purchases.subscriptionsv2.get`)를 **우리가 쓰는 필드만** 추린 것.
 * 이 타입 아래로는 Google의 필드명이 내려오지 않는다.
 */
export type PlaySubscriptionState =
  | 'active'
  /** 해지 예약 — Play의 "canceled"는 만료 전까지 유효하다(domain.md 8.2) */
  | 'canceled'
  | 'grace'
  /** 결제 실패로 보류 — 혜택이 없다 */
  | 'on_hold'
  | 'paused'
  | 'expired'
  /** 결제 대기(편의점 결제 등) — 아직 권한이 없다 */
  | 'pending';

export interface PlayPurchase {
  purchaseToken: string;
  /** 업·다운그레이드·재구독으로 이 토큰이 대체한 이전 토큰. 없으면 `null` */
  linkedPurchaseToken: string | null;
  productId: string;
  state: PlaySubscriptionState;
  startedAt: Date;
  expiresAt: Date;
  isAutoRenew: boolean;
  /** 다음 갱신 때 바뀔 상품(다운그레이드 예약). 없으면 `null` */
  pendingProductId: string | null;
  /** 결제에 실어 보낸 계정 결속 토큰(`obfuscatedExternalAccountId` = `purchase_intents.id`) */
  accountToken: string | null;
  /** 라이선스 테스터의 시험 구매면 `sandbox` */
  environment: SubscriptionEnvironment;
  /** 아직 확인(acknowledge)하지 않은 구매인가 — 3일 안에 확인하지 않으면 Google이 자동 환불한다 */
  needsAcknowledge: boolean;
}

/** Pub/Sub push가 실어 온 실시간 개발자 알림(RTDN) — 검증·해독을 마친 것 */
export interface PlayNotification {
  /** Pub/Sub `messageId` — 중복 차단의 키 */
  id: string;
  kind: 'subscription' | 'voided' | 'test' | 'other';
  /** `subscriptionNotification.notificationType` 번호. 구독 알림이 아니면 `null` */
  type: number | null;
  purchaseToken: string | null;
  eventAt: Date;
}

/**
 * Google Play와의 경계. 추상 클래스인 이유는 `AppStoreGateway`와 같다 — 주입 토큰이고, 테스트가 가짜 구현으로
 * 갈아 끼운다(진짜 Google 응답은 서비스 계정과 실제 구매가 있어야 받을 수 있다).
 */
export abstract class PlayStoreGateway {
  /** 검증 구성(패키지명·서비스 계정)이 있는가. 없으면 Android 결제 의도 생성부터 막는다 */
  abstract isEnabled(): boolean;

  /**
   * 구매 토큰의 현재 상태를 Google에 묻는다. Google이 그 토큰을 모르면 `null`.
   * @throws PlayStoreError
   */
  abstract fetchPurchase(purchaseToken: string): Promise<PlayPurchase | null>;

  /**
   * 구매를 확인(acknowledge)한다. **서버가 검증·반영을 마친 뒤에만** 부른다 — 먼저 확인하면 반영이 실패했을 때
   * "결제됐는데 티어 없음"이 된다(`subscription-api.md` 7장). 이미 확인된 구매에 다시 불러도 된다.
   * @throws PlayStoreError
   */
  abstract acknowledge(productId: string, purchaseToken: string): Promise<void>;

  /**
   * Pub/Sub push 요청을 검증하고 알림을 해독한다 — `Authorization` 헤더의 OIDC 토큰(서명·대상·발신 서비스 계정)과
   * 본문의 패키지명을 본다. 검증 전에는 본문을 믿지 않는다.
   * @throws PlayStoreError
   */
  abstract verifyNotification(
    authorization: string | undefined,
    envelope: PlayPushEnvelope,
  ): Promise<PlayNotification>;
}

/** Pub/Sub push 본문의 모양 — `message.data`가 base64 JSON이다 */
export interface PlayPushEnvelope {
  message: { data: string; messageId: string; publishTime?: string };
  subscription?: string;
}
