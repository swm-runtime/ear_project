import { SubscriptionEnvironment } from '@/modules/subscription/subscription.enum';
import { StoreSubscriptionStatus } from '@/modules/subscription/policies/store-state.policy';
import {
  StoreRenewalInfo,
  StoreTransaction,
} from '@/modules/subscription/subscription.types';

/**
 * 검증 실패의 두 갈래 — 호출부가 응답을 가르는 근거다.
 *
 * - `invalid`: 서명·번들·환경이 맞지 않는다. 다시 보내도 결과가 같다 → `SUBSCRIPTION_RECEIPT_INVALID`
 * - `unavailable`: Apple 쪽 조회(인증서 폐기 확인·상태 API)가 일시적으로 실패했다 → `SUBSCRIPTION_STORE_UNAVAILABLE`
 */
export type AppStoreFailureKind = 'invalid' | 'unavailable';

export class AppStoreVerificationError extends Error {
  constructor(
    readonly kind: AppStoreFailureKind,
    /** 로그용 사유. 서명 원문·토큰을 담지 않는다 */
    readonly reason: string,
  ) {
    super(`app store verification ${kind}: ${reason}`);
    this.name = 'AppStoreVerificationError';
  }
}

/** 검증을 마친 App Store 서버 알림 */
export interface AppStoreNotification {
  /** `notificationUUID` — 중복 차단의 키 */
  id: string;
  type: string;
  subtype: string | null;
  signedAt: Date;
  environment: SubscriptionEnvironment;
  transaction: StoreTransaction | null;
  renewal: StoreRenewalInfo | null;
}

export interface AppStoreSubscriptionStatus {
  status: StoreSubscriptionStatus;
  transaction: StoreTransaction;
  renewal: StoreRenewalInfo | null;
}

/**
 * App Store와의 경계. **이 아래로만 Apple의 필드명·라이브러리가 있다** — 위로는 우리 의미로 환산된 값만 올라간다.
 *
 * 추상 클래스인 이유: Nest 주입 토큰으로 쓰고, 테스트가 서명 없는 가짜 구현으로 갈아 끼운다
 * (진짜 Apple 서명은 테스트에서 만들 수 없다).
 */
export abstract class AppStoreGateway {
  /** 검증 구성이 있는가. 없으면 iOS 결제 의도 생성부터 막는다(`subscription-api.md` 7장) */
  abstract isEnabled(): boolean;

  /**
   * StoreKit 2 거래(JWS)를 검증하고 풀어낸다.
   * @throws AppStoreVerificationError
   */
  abstract verifyTransaction(
    signedTransaction: string,
  ): Promise<StoreTransaction>;

  /**
   * App Store Server Notifications V2의 `signedPayload`를 검증하고 풀어낸다(안쪽 거래·갱신 정보까지).
   * @throws AppStoreVerificationError
   */
  abstract verifyNotification(
    signedPayload: string,
  ): Promise<AppStoreNotification>;

  /** 그 환경의 구독 상태를 Apple에 물을 수 있는가(App Store Server API 키 구성 여부) */
  abstract canFetchStatus(environment: SubscriptionEnvironment): boolean;

  /**
   * 그 구독의 현재 상태를 Apple에 묻는다(만료 보정). Apple이 그 거래를 모르면 `null`.
   * @throws AppStoreVerificationError
   */
  abstract fetchStatus(
    originalTransactionId: string,
    environment: SubscriptionEnvironment,
  ): Promise<AppStoreSubscriptionStatus | null>;
}
