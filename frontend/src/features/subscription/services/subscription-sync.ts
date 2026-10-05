import { AppState, Linking, type NativeEventSubscription } from 'react-native';

import { getDevicePlatform } from '@/shared/lib/device-platform';
import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { createPurchaseIntent, restorePurchases, submitPurchase } from '../api/subscription.api';
import { useSubscriptionPurchaseStore } from '../store/subscription-purchase.store';
import { ANDROID_PACKAGE_NAME } from '../subscription.constants';
import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { MySubscription, SubscriptionStore } from '../subscription.types';
import { createExpoIapAdapter } from './iap-adapter';
import { createPurchaseService } from './purchase.service';

type SubscriptionChangedListener = (subscription: MySubscription) => void;

const changedListeners = new Set<SubscriptionChangedListener>();

/**
 * 서버가 구독을 확정했다(결제·복원·미완료 거래 회복) — 프로필·설정·라이브러리 요약 invalidate 와 이 feature 의
 * 캐시 갱신은 app/bootstrap 이 주입한다(다른 feature 의 쿼리 키를 여기서 알지 않는다 — architecture.md 4.3).
 */
export const registerSubscriptionChangedListener = (
  listener: SubscriptionChangedListener,
): (() => void) => {
  changedListeners.add(listener);
  return () => changedListeners.delete(listener);
};

const platform = getDevicePlatform();

/** 결제 서비스 싱글턴 — 결제 모듈이 없는 바이너리에서는 start 하지 않으므로 네이티브를 건드리지 않는다 */
export const purchaseService = createPurchaseService({
  platform,
  adapter: createExpoIapAdapter(platform),
  api: { createIntent: createPurchaseIntent, submit: submitPurchase, restore: restorePurchases },
  onSubscriptionChanged: (subscription) =>
    changedListeners.forEach((listener) => listener(subscription)),
  onRecovered: () => useToastStore.getState().show(SUBSCRIPTION_COPY.result.recovered),
  setUiState: (patch) => useSubscriptionPurchaseStore.setState(patch),
  schedule: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
});

let appStateSubscription: NativeEventSubscription | null = null;
let isSignedIn: () => boolean = () => false;
let onForeground: () => void = () => undefined;

/**
 * 구독 동기화 기동(subscription.md 4.3 · architecture.md 5.5) — 로그인 상태에서 앱 실행·포그라운드 복귀마다
 * ① 미완료 거래 제출 ② 구독 상태 재조회(onForeground — bootstrap 이 캐시 무효화를 주입한다).
 * **구독 UI 가 꺼진 바이너리(플래그·결제 모듈·플랫폼)에서는 아무것도 하지 않는다** — 결제 모듈을 부르지 않는다.
 */
export const startSubscriptionSync = (options: {
  isSignedIn: () => boolean;
  onForeground: () => void;
}): void => {
  if (!IS_SUBSCRIPTION_UI_ENABLED || appStateSubscription) return;
  isSignedIn = options.isSignedIn;
  onForeground = options.onForeground;
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active' || !isSignedIn()) return;
    void purchaseService.recoverUnfinished();
    onForeground();
  });
};

/** 로그인 완료 — 스토어 연결·리스너·미완료 거래 제출을 시작한다 */
export const resumeSubscriptionSync = (): void => {
  if (!IS_SUBSCRIPTION_UI_ENABLED) return;
  void purchaseService.start();
};

/** 로그아웃·탈퇴·세션 만료 — 재시도를 멈춘다. 다음 계정의 세션으로 앞 사용자의 거래를 제출하지 않는다 */
export const stopSubscriptionSync = (): void => {
  if (!IS_SUBSCRIPTION_UI_ENABLED) return;
  purchaseService.stop();
  useSubscriptionPurchaseStore.getState().setEmailResume(null);
};

/**
 * 스토어 구독 관리 화면 — [구독 해지]·[구독 다시 시작]·[결제 수단 확인]의 목적지(subscription.md 4.5).
 * 어느 스토어로 보낼지는 서버의 `store` 가 정한다(기기 플랫폼이 아니다 — 다른 스토어 구독자도 있다).
 */
export const openStoreSubscriptionManagement = (
  store: SubscriptionStore | null,
  productId: string | null,
): void => {
  const target = store ?? (platform === 'android' ? 'play_store' : 'app_store');
  const url =
    target === 'app_store'
      ? 'itms-apps://apps.apple.com/account/subscriptions'
      : `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE_NAME}${
          productId ? `&sku=${encodeURIComponent(productId)}` : ''
        }`;
  Linking.openURL(url).catch((error) =>
    logger.warn('[subscription] failed to open store subscriptions', error),
  );
};
