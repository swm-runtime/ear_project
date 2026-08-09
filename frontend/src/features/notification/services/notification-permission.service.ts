import { logger } from '@/shared/lib/logger';

import { NOTIFICATION_MOCK_SCENARIO } from '../notification.constants';
import type { OsPermissionStatus } from '../notification.types';

/**
 * OS 알림 권한 대역 — 푸시 SDK(@react-native-firebase/messaging, architecture.md 2)가
 * 아직 설치되지 않아 개발 환경에서만 동작하는 스텁이다(provider-auth.service.ts와 같은 관례).
 * SDK 연동 시 이 모듈의 구현만 교체하면 화면·훅은 그대로 쓴다.
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

/** 이미 허용된 상태면 온보딩 O10·O11을 통째로 건너뛴다(onboarding-uiux.md 4.7) */
export const getOsPermissionStatus = async (): Promise<OsPermissionStatus> => {
  if (__DEV__) {
    return devStatus;
  }
  throw new Error('push notification SDK not integrated yet');
};

/** OS 권한 다이얼로그를 띄운다 — 사전 안내의 [알림 받기]에서만 호출한다(notification.md 4.1) */
export const requestOsPermission = async (): Promise<boolean> => {
  if (__DEV__) {
    // 거부된 권한은 OS가 다이얼로그를 다시 띄우지 않는다 — 스텁도 같은 동작을 흉내 낸다
    if (devStatus === 'denied') return false;
    logger.debug('[notification] dev stub: OS notification permission granted');
    devStatus = 'granted';
    return true;
  }
  throw new Error('push notification SDK not integrated yet');
};

/** 권한이 허용된 경우에만 존재하는 값이다. 발급받지 못한 토큰을 만들어 보내지 않는다(onboarding-api.md 4.9) */
export const getPushToken = async (): Promise<string | null> => {
  if (__DEV__) {
    return devStatus === 'granted' ? 'dev-push-token' : null;
  }
  throw new Error('push notification SDK not integrated yet');
};
