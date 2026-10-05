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
  /** pending = 결제 대기(iOS 승인 요청·Android 결제 보류) — 아직 구독이 아니라 제출하지 않는다 */
  state: 'purchased' | 'pending' | 'unknown';
  /** finish 에 원본을 되돌려 준다 — 서비스는 내용을 보지 않는다 */
  raw: unknown;
}

export type StoreErrorKind =
  'cancelled' | 'pending' | 'alreadyOwned' | 'unavailable' | 'network' | 'unknown';

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

export interface IapAdapter {
  connect(): Promise<void>;
  fetchSubscriptions(productIds: string[]): Promise<StoreProduct[]>;
  /**
   * 결제 시트를 연다. 결과가 바로 오면 돌려주고, 리스너로만 오면(Android) 빈 배열이다.
   * 사용자 취소·결제 대기 등은 StoreError 로 던진다.
   */
  requestSubscription(input: { productId: string; accountToken: string }): Promise<StorePurchase[]>;
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
};

export const toStoreError = (error: unknown): StoreError => {
  if (error instanceof StoreError) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error);
  return new StoreError(STORE_ERROR_KIND[code] ?? 'unknown', message);
};

const toStorePurchase = (purchase: Purchase): StorePurchase => ({
  transactionId: purchase.id,
  productId: purchase.productId,
  token: purchase.purchaseToken ?? null,
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

  requestSubscription: async ({ productId, accountToken }) => {
    try {
      const result = await requestPurchase({
        type: 'subs',
        request:
          platform === 'ios'
            ? // 계정 결속 토큰 — 서명 거래 안에 담겨 돌아와 서버가 거래의 주인을 확인한다(subscription-api.md 7장)
              { apple: { sku: productId, appAccountToken: accountToken } }
            : { google: { skus: [productId], obfuscatedAccountId: accountToken } },
      });
      if (result === null) return [];
      return (Array.isArray(result) ? result : [result]).map(toStorePurchase);
    } catch (error) {
      throw toStoreError(error);
    }
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
