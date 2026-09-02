import { Platform } from 'react-native';

/**
 * 서버가 DevicePlatform enum으로 검증하는 값 집합 — 기기 등록(onboarding-api.md 4.9)·
 * 설정 조회(settings-api.md 4.1)·스플래시 버전 조회(splash.md 6장)가 같은 문자열을 쓴다.
 */
export type DevicePlatform = 'ios' | 'android';

/**
 * ios·android 밖의 값(web 등)은 ios로 접는 것이 현재 동작이다 — 앱만 있는 지금은
 * 도달하지 않고, 웹이 생기면 서버 enum부터 늘려야 한다(tickets settings-version-platform-param).
 */
export const getDevicePlatform = (): DevicePlatform =>
  Platform.OS === 'android' ? 'android' : 'ios';
