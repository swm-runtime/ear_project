import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/** 교체 시트가 돌려준 구매 — 서버 제출에 필요한 값만 */
export interface PlayChangedPurchase {
  productId: string | null;
  purchaseToken: string;
  orderId: string | null;
  purchaseState: 'purchased' | 'pending' | 'unknown';
  isAcknowledged: boolean;
  purchaseTime: number;
}

/**
 * Play Billing 교체 방식 — `BillingFlowParams.SubscriptionUpdateParams.ReplacementMode` 의 정수값
 * (업그레이드 = 즉시 + 남은 기간 비례 청구 · 다운그레이드 = 다음 갱신부터)
 */
export const PLAY_REPLACEMENT_MODE = {
  CHARGE_PRORATED_PRICE: 2,
  DEFERRED: 6,
} as const;

interface PlaySubscriptionChangeNative {
  changeSubscription(
    productId: string,
    oldPurchaseToken: string,
    replacementMode: number,
    /** 교체되는 구독에 실린 값. rt 32 vc 34 빌드는 null 을 받지 못한다 — 호출부는 값이 있을 때만 이 경로를 쓴다 */
    obfuscatedAccountId: string,
  ): Promise<PlayChangedPurchase[]>;
}

/**
 * 이 빌드에 교체 모듈이 있는가 — Android rt 32 재빌드(2026-10-08 이후)부터. 옛 빌드는 null 이라 호출부가 결제 라이브러리의
 * 교체(즉시 적용 고정)로 내려가고, 다운그레이드는 막는다. 모듈 추가에도 runtime 을 올리지 않은 이유다(새 JS 가 옛 네이티브에서 안 깨진다)
 */
export const PlaySubscriptionChange: PlaySubscriptionChangeNative | null =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<PlaySubscriptionChangeNative>('PlaySubscriptionChange')
    : null;
