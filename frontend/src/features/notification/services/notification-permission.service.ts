import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@/shared/lib/logger';

import {
  ANDROID_DEFAULT_CHANNEL_ID,
  IS_OS_PERMISSION_STUBBED,
  NOTIFICATION_MOCK_SCENARIO,
} from '../notification.constants';
import { NOTIFICATION_COPY } from '../notification.copy';
import type { OsPermissionStatus } from '../notification.types';

/**
 * OS 알림 권한·푸시 토큰 — `expo-notifications` + Expo Push(architecture.md 2 푸시 행,
 * 결정 2026-09-17). 화면·훅은 이 세 함수만 쓴다.
 *
 * **스텁이 남는 곳은 둘이다**(`IS_OS_PERMISSION_STUBBED`): 웹(푸시가 없다)과 mock 개발
 * 실행(Expo Go·시뮬레이터에서는 토큰 발급이 실패한다 — 화면 흐름만 확인한다). 운영 빌드는
 * 항상 실제 구현을 탄다.
 * onboarding에서 이관됐다 — 온보딩·설정이 같은 권한 상태 하나를 봐야 한다(architecture.md 4.4).
 */
const initialStatus = (): OsPermissionStatus => {
  switch (NOTIFICATION_MOCK_SCENARIO) {
    case 'permission-granted':
      return 'granted';
    case 'permission-denied':
      return 'denied';
    default:
      return 'undetermined';
  }
};

let devStatus: OsPermissionStatus = initialStatus();

/**
 * iOS의 임시 허용(provisional)·일시 허용(ephemeral)도 "허용"이다 — 알림이 실제로 간다.
 * `granted` 불리언은 이 둘을 false로 돌려주므로 iOS는 상세 상태로 읽는다.
 */
const toStatus = (permissions: Notifications.NotificationPermissionsStatus): OsPermissionStatus => {
  const iosStatus = permissions.ios?.status;
  if (
    permissions.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  // 다시 물을 수 있으면 미결정이다. Android 13은 거부 1회까지 canAskAgain 이 true 로 남는다
  if (permissions.status === Notifications.PermissionStatus.UNDETERMINED) return 'undetermined';
  return permissions.canAskAgain && Platform.OS === 'android' ? 'undetermined' : 'denied';
};

/**
 * Android 13+ 는 **채널이 하나라도 있어야** 권한 다이얼로그가 뜨고 토큰이 발급된다.
 * 서버는 채널을 지정하지 않으므로 기본 채널 하나만 둔다(드립 도착 — 종류가 하나다).
 */
const ensureAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL_ID, {
    name: NOTIFICATION_COPY.androidChannelName,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
};

/** 이미 허용된 상태면 온보딩 O10·O11을 통째로 건너뛴다(onboarding-uiux.md 4.7) */
export const getOsPermissionStatus = async (): Promise<OsPermissionStatus> => {
  if (IS_OS_PERMISSION_STUBBED) return devStatus;
  return toStatus(await Notifications.getPermissionsAsync());
};

/** OS 권한 다이얼로그를 띄운다 — 사전 안내의 [알림 받기]에서만 호출한다(notification.md 4.1) */
export const requestOsPermission = async (): Promise<boolean> => {
  if (IS_OS_PERMISSION_STUBBED) {
    // 거부된 권한은 OS가 다이얼로그를 다시 띄우지 않는다 — 스텁도 같은 동작을 흉내 낸다
    if (devStatus === 'denied') return false;
    logger.debug('[notification] dev stub: OS notification permission granted');
    devStatus = 'granted';
    return true;
  }
  await ensureAndroidChannel();
  const permissions = await Notifications.requestPermissionsAsync({
    // 배지는 쓰지 않는다 — 읽지 않은 수를 앱 아이콘에 세지 않는다(쓰지 않는 권한을 묻지 않는다)
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return toStatus(permissions) === 'granted';
};

/**
 * 권한이 허용된 경우에만 존재하는 값이다. 발급받지 못한 토큰을 만들어 보내지 않는다
 * (onboarding-api.md 4.9) — 발급 실패(네트워크·자격 증명 누락)도 `null`이다. 실패를 던지면
 * 호출부가 권한 결과 보고까지 포기한다.
 */
export const getPushToken = async (): Promise<string | null> => {
  if (IS_OS_PERMISSION_STUBBED) {
    return devStatus === 'granted' ? 'dev-push-token' : null;
  }
  if ((await getOsPermissionStatus()) !== 'granted') return null;
  try {
    await ensureAndroidChannel();
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    logger.warn('[notification] failed to get expo push token', error);
    return null;
  }
};
