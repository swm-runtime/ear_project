/**
 * 스토어 결제 SDK 경계 — 결제 서비스는 이 인터페이스만 알고, expo-iap 은 여기 한 파일에서만 import 한다.
 * 테스트는 이 인터페이스를 가짜로 바꿔 끼워 상태 전이를 검증한다(convention.md 7.2 — 결제 정책 로직).
 *
 * 라이브러리 선택(KAN-120): **expo-iap** — Expo Modules 기반이라 config plugin 으로 붙고(Expo SDK 57 · New Arch),
 * iOS 는 StoreKit 2(서명 거래 JWS = `purchaseToken`), Android 는 Play Billing 8 이다. `react-native-iap` 는 같은
 * 저자(OpenIAP)의 Nitro 판이라 `react-native-nitro-modules` 를 하나 더 실어야 해 고르지 않았다.
 */
import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  getPendingTransactionsIOS,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  syncIOS,
  type Purchase,
} from 'expo-iap';

import { logger } from '@/shared/lib/logger';

import {
  PLAY_REPLACEMENT_MODE,
  PlaySubscriptionChange,
  type PlayChangedPurchase,
} from '../../../../modules/play-subscription-change/src';
import type { PurchasePlatform } from '../subscription.types';

/** 스토어가 준 상품 — 화면은 이 현지 가격을 그린다(price_krw 는 참고값) */
export interface StoreProduct {
  productId: string;
  displayPrice: string;
}

/** 스토어 거래 — 서버 제출과 finish 에 필요한 것만 추린다 */
export interface StorePurchase {
  /** 거래 식별자 — 같은 거래의 중복 제출을 거르는 열쇠 */
  transactionId: string;
  productId: string;
  /** iOS: StoreKit 2 서명 거래(JWS) · Android: 구매 토큰. 없으면 제출할 수 없다 */
  token: string | null;
  /**
   * Android — 이 구매를 살 때 실은 obfuscatedAccountId(그때의 결제 의도 id). 교체 결제는 **이 값을 그대로** 실어야 한다 —
   * 다르면 Google 이 시트에서 거절한다(DEVELOPER_ERROR — KAN-158). iOS·모르면 null
   */
  obfuscatedAccountId: string | null;
  /** pending = 결제 대기(iOS 승인 요청·Android 결제 보류) — 아직 구독이 아니라 제출하지 않는다 */
  state: 'purchased' | 'pending' | 'unknown';
  /** finish 에 원본을 되돌려 준다 — 서비스는 내용을 보지 않는다 */
  raw: unknown;
}

export type StoreErrorKind =
  | 'cancelled'
  | 'pending'
  | 'alreadyOwned'
  | 'unavailable'
  | 'network'
  /** 스토어가 요청을 거절했다(Play DEVELOPER_ERROR — 교체 조건 불일치 등) */
  | 'rejected'
  | 'unknown';

/** 스토어 SDK 실패의 정규화 — 화면은 kind 로만 분기한다 */
export class StoreError extends Error {
  constructor(
    readonly kind: StoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

/**
 * Android 요금제 변경의 교체 입력(KAN-158) — 지금 구독의 구매 토큰·상품과 방식. Google 이 새 구매에
 * `linkedPurchaseToken` 을 붙여 서버가 같은 구독 행에 잇는다(subscription-api.md 4.4).
 * 방식은 교체 모듈(modules/play-subscription-change)이 있을 때만 지켜진다 — 없으면 결제 라이브러리가 즉시 적용으로 고정한다
 */
export interface ReplaceSubscription {
  purchaseToken: string;
  oldProductId: string;
  /**
   * 교체되는 구매에 실린 obfuscatedAccountId — 교체 결제는 새 결제 의도 id 가 아니라 **이 값**을 싣는다(Google 규칙 — 다르면
   * "Account identifiers don't match the previous subscription"). null 이면 싣지 않는다. 새 의도 id 는 서버 제출에만 쓴다
   */
  accountToken: string | null;
  /** chargeProrated = 즉시 적용 + 남은 기간 비례 정산(업그레이드) · deferred = 다음 갱신부터(다운그레이드) */
  mode: 'chargeProrated' | 'deferred';
}

export interface IapAdapter {
  connect(): Promise<void>;
  fetchSubscriptions(productIds: string[]): Promise<StoreProduct[]>;
  /**
   * 결제 시트를 연다. 결과가 바로 오면 돌려주고, 리스너로만 오면(Android) 빈 배열이다.
   * 사용자 취소·결제 대기 등은 StoreError 로 던진다.
   */
  requestSubscription(input: {
    productId: string;
    accountToken: string;
    /** Android 요금제 변경에만 — iOS 는 무시한다(구독 그룹이 교체한다) */
    replace?: ReplaceSubscription;
  }): Promise<StorePurchase[]>;
  /**
   * Android — 교체할 지금 구독. 기기의 Play 구매 중 결제 대상과 다른 상품, 가장 최근 것. 없으면 null. iOS 는 늘 null.
   * `currentProductId`(서버의 지금 구독 상품)를 알면 그 상품만 고른다 — 기기 캐시에는 만료·환불된 구매도 남아 있다.
   * 모르면 확인(acknowledge)된 구매만 고른다 — 서버가 거부한 두 번째 구독(미확인, 곧 자동 환불)을 집지 않게
   */
  findReplaceable(
    targetProductId: string,
    currentProductId: string | null,
  ): Promise<StorePurchase | null>;
  /**
   * 다운그레이드를 "다음 갱신부터"로 예약할 수 있는가 — iOS 는 늘 true(구독 그룹), Android 는 교체 모듈이 든 빌드만.
   * 결제 라이브러리만으로는 교체가 즉시 적용으로 고정된다(PlaySubscriptionChangeModule 주석)
   */
  readonly supportsDeferredDowngrade: boolean;
  /** iOS 거래 종료 — **서버가 200 을 준 뒤에만** 부른다. Android 에서는 부르지 않는다(확인은 서버 몫) */
  finish(purchase: StorePurchase): Promise<void>;
  /** 끝나지 않은 거래 — 앱 실행·포그라운드 복귀 때 서버에 제출한다 */
  getUnfinished(): Promise<StorePurchase[]>;
  /** 구매 복원 — 지금 유효한 구독 거래 */
  getActiveForRestore(): Promise<StorePurchase[]>;
  onPurchaseUpdated(listener: (purchase: StorePurchase) => void): () => void;
  onPurchaseError(listener: (error: StoreError) => void): () => void;
}

/* ── 정규화 ── */

const STORE_ERROR_KIND: Partial<Record<string, StoreErrorKind>> = {
  [ErrorCode.UserCancelled]: 'cancelled',
  [ErrorCode.DeferredPayment]: 'pending',
  [ErrorCode.Pending]: 'pending',
  [ErrorCode.AlreadyOwned]: 'alreadyOwned',
  [ErrorCode.NetworkError]: 'network',
  [ErrorCode.ServiceTimeout]: 'network',
  [ErrorCode.ServiceDisconnected]: 'network',
  [ErrorCode.RemoteError]: 'network',
  [ErrorCode.IapNotAvailable]: 'unavailable',
  [ErrorCode.BillingUnavailable]: 'unavailable',
  [ErrorCode.ItemUnavailable]: 'unavailable',
  [ErrorCode.SkuNotFound]: 'unavailable',
  [ErrorCode.QueryProduct]: 'unavailable',
  [ErrorCode.InitConnection]: 'unavailable',
  [ErrorCode.DeveloperError]: 'rejected',
  // 교체 모듈(PlaySubscriptionChange)의 코드 — E_BILLING_<Play responseCode>
  E_USER_CANCELLED: 'cancelled',
  E_BILLING_7: 'alreadyOwned',
  E_BILLING_5: 'rejected',
  E_BILLING_2: 'network',
  'E_BILLING_-1': 'network',
  E_SERVICE_DISCONNECTED: 'network',
  E_BILLING_3: 'unavailable',
  E_BILLING_4: 'unavailable',
  E_PRODUCT_NOT_FOUND: 'unavailable',
};

export const toStoreError = (error: unknown): StoreError => {
  if (error instanceof StoreError) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const base = error instanceof Error ? error.message : String(error);
  // Play 의 responseCode · debugMessage 를 함께 남긴다 — code 만으로는 시트가 왜 끊겼는지 안 보였다(KAN-158 수정 3)
  const detail =
    typeof error === 'object' && error !== null
      ? (error as { responseCode?: unknown; debugMessage?: unknown })
      : {};
  const extra = [
    code !== '' ? `code=${code}` : null,
    detail.responseCode != null ? `responseCode=${String(detail.responseCode)}` : null,
    detail.debugMessage ? `debugMessage=${String(detail.debugMessage)}` : null,
  ].filter((part) => part !== null);
  const message = extra.length > 0 ? `${base} (${extra.join(' ')})` : base;
  return new StoreError(STORE_ERROR_KIND[code] ?? 'unknown', message);
};

const toStorePurchase = (purchase: Purchase): StorePurchase => ({
  transactionId: purchase.id,
  productId: purchase.productId,
  token: purchase.purchaseToken ?? null,
  obfuscatedAccountId:
    'obfuscatedAccountIdAndroid' in purchase ? (purchase.obfuscatedAccountIdAndroid ?? null) : null,
  state: purchase.purchaseState,
  raw: purchase,
});

/** 교체 방식 → Play Billing 정수(교체 모듈) */
const PLAY_MODE: Record<ReplaceSubscription['mode'], number> = {
  chargeProrated: PLAY_REPLACEMENT_MODE.CHARGE_PRORATED_PRICE,
  deferred: PLAY_REPLACEMENT_MODE.DEFERRED,
};

/** 교체 모듈이 돌려준 구매 → 스토어 거래. Android 는 finish 를 하지 않아 raw 는 보지 않는다 */
const fromPlayChanged = (
  purchase: PlayChangedPurchase,
  fallbackProductId: string,
): StorePurchase => ({
  transactionId: purchase.orderId ?? purchase.purchaseToken,
  productId: purchase.productId ?? fallbackProductId,
  token: purchase.purchaseToken,
  obfuscatedAccountId: null,
  state: purchase.purchaseState,
  raw: purchase,
});

const isUnacknowledgedAndroid = (purchase: Purchase): boolean =>
  'isAcknowledgedAndroid' in purchase && purchase.isAcknowledgedAndroid === false;

/* ── expo-iap 구현 ── */

/**
 * expo-iap 위의 구현. **이 파일을 import 해도 네이티브 모듈을 건드리지 않는다**(expo-iap 은 첫 호출 때 모듈을
 * 찾는다) — 그래도 호출 자체는 결제 모듈이 있는 바이너리에서만 해야 하므로 서비스가 시작 여부를 막는다.
 */
export const createExpoIapAdapter = (platform: PurchasePlatform): IapAdapter => ({
  connect: async () => {
    try {
      await initConnection();
    } catch (error) {
      throw toStoreError(error);
    }
  },

  fetchSubscriptions: async (productIds) => {
    try {
      const products = (await fetchProducts({ skus: productIds, type: 'subs' })) ?? [];
      return products.map((product) => ({
        productId: product.id,
        displayPrice: product.displayPrice,
      }));
    } catch (error) {
      throw toStoreError(error);
    }
  },

  requestSubscription: async ({ productId, accountToken, replace }) => {
    // Android 요금제 변경 — 교체 모듈이 있으면 방식을 지정해 연다(업그레이드 즉시 + 비례 · 다운그레이드 다음 갱신부터)
    // 계정 id 는 교체되는 구매의 값이어야 한다 — 없으면 모듈(이 빌드는 값을 꼭 받는다) 대신 결제 라이브러리로, 값을 빼고 보낸다
    if (
      platform === 'android' &&
      replace &&
      PlaySubscriptionChange !== null &&
      replace.accountToken !== null
    ) {
      try {
        const purchases = await PlaySubscriptionChange.changeSubscription(
          productId,
          replace.purchaseToken,
          PLAY_MODE[replace.mode],
          replace.accountToken,
        );
        return purchases.map((purchase) => fromPlayChanged(purchase, productId));
      } catch (error) {
        throw toStoreError(error);
      }
    }
    if (platform === 'android' && replace?.mode === 'deferred') {
      // 다음 갱신부터는 모듈로만 된다 — 결제 라이브러리는 즉시 적용으로 고정한다. 즉시로 바꿔 버리지 않는다
      throw new StoreError(
        'unavailable',
        'deferred plan change needs the play module and account id',
      );
    }
    try {
      const result = await requestPurchase({
        type: 'subs',
        request:
          platform === 'ios'
            ? // 계정 결속 토큰 — 서명 거래 안에 담겨 돌아와 서버가 거래의 주인을 확인한다(subscription-api.md 7장)
              { apple: { sku: productId, appAccountToken: accountToken } }
            : {
                google: {
                  skus: [productId],
                  // 교체면 교체되는 구매의 값(없으면 빼고), 새 구독이면 새 결제 의도 id
                  ...(replace
                    ? replace.accountToken !== null
                      ? { obfuscatedAccountId: replace.accountToken }
                      : {}
                    : { obfuscatedAccountId: accountToken }),
                  // 교체 모듈이 없는 빌드의 요금제 변경 — 구매 토큰만 넘기면 라이브러리가 즉시 적용(CHARGE_FULL_PRICE)으로
                  // 교체한다. 상품 단위 교체(subscriptionProductReplacementParams)는 기기 Play 스토어가 몰라 시트가 끊겨
                  // 쓰지 않는다(2026-10-08 실측). 다운그레이드는 서비스가 여기 오기 전에 막는다
                  ...(replace ? { purchaseToken: replace.purchaseToken } : {}),
                },
              },
      });
      if (result === null) return [];
      return (Array.isArray(result) ? result : [result]).map(toStorePurchase);
    } catch (error) {
      throw toStoreError(error);
    }
  },

  supportsDeferredDowngrade: platform === 'ios' || PlaySubscriptionChange !== null,

  findReplaceable: async (targetProductId, currentProductId) => {
    if (platform === 'ios') return null;
    const candidates = (await getAvailablePurchases())
      .filter(
        (purchase) =>
          purchase.productId !== targetProductId &&
          purchase.purchaseState === 'purchased' &&
          typeof purchase.purchaseToken === 'string' &&
          // 서버의 지금 구독과 같은 상품이면 확인 전이어도 받는다(방금 산 구독이 서버 반영 직후 잠깐 미확인일 수 있다)
          (currentProductId !== null
            ? purchase.productId === currentProductId
            : !isUnacknowledgedAndroid(purchase)),
      )
      // 기기 캐시엔 만료·환불된 구매도 남는다 — 가장 최근 구매를 고른다
      .sort((a, b) => b.transactionDate - a.transactionDate);
    if (candidates.length > 1) {
      logger.warn('[subscription] several replaceable play subscriptions', candidates.length);
    }
    return candidates.length > 0 ? toStorePurchase(candidates[0]) : null;
  },

  finish: async (purchase) => {
    // Android 의 finishTransaction 은 acknowledge 다 — 서버가 반영(커밋) 뒤에 확인한다. 앱이 하면 안 된다
    if (platform !== 'ios') return;
    await finishTransaction({ purchase: purchase.raw as Purchase, isConsumable: false });
  },

  getUnfinished: async () => {
    if (platform === 'ios') {
      return (await getPendingTransactionsIOS()).map(toStorePurchase);
    }
    // Android 의 "미완료" = 아직 확인(acknowledge)되지 않은 구매 — 서버가 반영하며 확인한다
    const purchases = await getAvailablePurchases();
    return purchases.filter(isUnacknowledgedAndroid).map(toStorePurchase);
  },

  getActiveForRestore: async () => {
    if (platform === 'ios') {
      // 스토어 계정과 거래를 다시 맞춘다(로그인 시트가 뜰 수 있다). 사용자가 닫아도 기기에 있는 거래로 진행한다
      await syncIOS().catch((error: unknown) =>
        logger.warn('[subscription] syncIOS failed', error),
      );
      return (await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })).map(
        toStorePurchase,
      );
    }
    return (await getAvailablePurchases()).map(toStorePurchase);
  },

  onPurchaseUpdated: (listener) => {
    const subscription = purchaseUpdatedListener((purchase) => listener(toStorePurchase(purchase)));
    return () => subscription.remove();
  },

  onPurchaseError: (listener) => {
    const subscription = purchaseErrorListener((error) => listener(toStoreError(error)));
    return () => subscription.remove();
  },
});
