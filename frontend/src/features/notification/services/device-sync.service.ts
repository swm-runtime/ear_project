import * as Notifications from 'expo-notifications';
import { AppState, type NativeEventSubscription } from 'react-native';

import { APP_VERSION } from '@/shared/lib/app-version';
import { getDeviceId } from '@/shared/lib/device-id';
import { logger } from '@/shared/lib/logger';

import { syncDevicePermission } from '../api/notification.api';
import { IS_OS_PERMISSION_STUBBED } from '../notification.constants';
import { getOsPermissionStatus, getPushToken } from './notification-permission.service';

/**
 * 기기 동기화(notification.md 4.2 · architecture.md 5.5) — OS 권한과 푸시 토큰을 서버에 맞춘다.
 *
 * 부르는 시점은 셋이다: **로그인 완료**(bootstrap이 호출) · **포그라운드 복귀** · **토큰 변경**.
 * 로그인 시점이 빠지면 안 된다 — 서버는 로그아웃 때 그 기기의 토큰을 무효화하므로(KAN-68),
 * 다시 로그인한 뒤 한 번 더 올리지 않으면 그 기기로는 알림이 영영 가지 않는다.
 *
 * 사전 안내를 아직 안 본 사용자(권한 미결정)도 올린다. 권한 결과 보고인 동시에 기기 등록이고
 * (onboarding-api.md 4.9), 토큰은 `null`로 간다 — 서버는 권한 없는 기기로 보내지 않는다.
 */

let appStateSubscription: NativeEventSubscription | null = null;
let tokenSubscription: Notifications.EventSubscription | null = null;
let inFlight: Promise<void> | null = null;
/** 마지막으로 서버에 올린 값 — 같은 값이면 다시 보내지 않는다(복귀마다 PUT 을 쏘지 않는다) */
let lastSynced: string | null = null;
/**
 * 로그인 여부. notification이 auth를 직접 import하면 의존 표(architecture.md 4.4)를 어기므로
 * `app/bootstrap`이 주입한다. 로그아웃 상태의 호출은 401을 낳고 토큰 갱신 실패로 이어진다.
 */
let isAuthenticated: () => boolean = () => false;

const runSync = async (): Promise<void> => {
  const status = await getOsPermissionStatus();
  const isGranted = status === 'granted';
  const pushToken = isGranted ? await getPushToken() : null;
  const fingerprint = `${isGranted}:${pushToken ?? ''}`;
  if (fingerprint === lastSynced) return;

  await syncDevicePermission({
    deviceId: await getDeviceId(),
    pushToken,
    isOsPermissionGranted: isGranted,
    appVersion: APP_VERSION,
  });
  lastSynced = fingerprint;
};

/**
 * 동기화 1회. 실패는 사용자에게 알리지 않는다 — 배경 동기화이고 다음 복귀에 다시 시도한다
 * (`common-error-handling.md` 4.3).
 */
export const syncDeviceNow = (): void => {
  if (inFlight || !isAuthenticated()) return;
  inFlight = runSync()
    .catch((error) => logger.warn('[notification] device sync failed', error))
    .finally(() => {
      inFlight = null;
    });
};

/** 로그아웃 — 다음 로그인은 같은 값이어도 다시 올려야 한다(서버가 토큰을 지웠다) */
export const resetDeviceSync = (): void => {
  lastSynced = null;
};

export const startDeviceSync = (isAuthenticatedFn: () => boolean): void => {
  isAuthenticated = isAuthenticatedFn;
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') syncDeviceNow();
  });
  if (!IS_OS_PERMISSION_STUBBED) {
    // 토큰은 OS가 바꾼다(앱 복원·재설치·APNs 재발급) — 받은 즉시 올린다(architecture.md 13장 확정)
    tokenSubscription = Notifications.addPushTokenListener(() => {
      lastSynced = null;
      syncDeviceNow();
    });
  }
  syncDeviceNow();
};

export const stopDeviceSync = (): void => {
  appStateSubscription?.remove();
  appStateSubscription = null;
  tokenSubscription?.remove();
  tokenSubscription = null;
};
