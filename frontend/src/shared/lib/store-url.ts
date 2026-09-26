import { Platform } from 'react-native';

/**
 * 스토어 목적지 — 설정의 [업데이트] 행(settings.md)과 스플래시 강제 업데이트 화면(splash.md 4.1, KAN-99)이 같이 쓴다.
 * 원천은 배포 설정(`EXPO_PUBLIC_STORE_URL`)이고 **플랫폼별 폴백을 실값으로 둔다** — 한쪽 값만 두면 반대 플랫폼
 * 사용자가 남의 스토어로 간다(2026-09 iOS 심사 통과 뒤 Play 고정값이 그대로였던 사고).
 * iOS 앱 ID 는 `frontend/eas.json` 의 `submit.production.ios.ascAppId` 와 같은 값이다.
 */
const IOS_STORE_URL = 'https://apps.apple.com/app/id6807708636';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.runtime.ear';
export const STORE_URL =
  process.env.EXPO_PUBLIC_STORE_URL ??
  (Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL);
