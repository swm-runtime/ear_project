import { logger } from '@/shared/lib/logger';

import type { OsPermissionStatus } from '../onboarding.types';

/**
 * OS 알림 권한 대역 — 푸시 SDK(@react-native-firebase/messaging, architecture.md 2)가
 * 아직 설치되지 않아 개발 환경에서만 동작하는 스텁이다(provider-auth.service.ts와 같은 관례).
 * SDK 연동 시 이 모듈의 구현만 교체하면 화면·훅은 그대로 쓴다.
 */
let devGranted = false;

/** 이미 허용된 상태면 O10·O11을 통째로 건너뛴다(onboarding-uiux.md 4.7) */
export const getOsPermissionStatus = async (): Promise<OsPermissionStatus> => {
  if (__DEV__) {
    return devGranted ? 'granted' : 'undetermined';
  }
  throw new Error('push notification SDK not integrated yet');
};

/** OS 권한 다이얼로그를 띄운다 — 사전 안내(O10)의 [알림 받기]에서만 호출한다 */
export const requestOsPermission = async (): Promise<boolean> => {
  if (__DEV__) {
    logger.debug('[onboarding] dev stub: OS notification permission granted');
    devGranted = true;
    return true;
  }
  throw new Error('push notification SDK not integrated yet');
};

/** 권한이 허용된 경우에만 존재하는 값이다. 발급받지 못한 토큰을 만들어 보내지 않는다(onboarding-api.md 4.9) */
export const getPushToken = async (): Promise<string | null> => {
  if (__DEV__) {
    return devGranted ? 'dev-push-token' : null;
  }
  throw new Error('push notification SDK not integrated yet');
};
