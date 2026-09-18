/**
 * notification feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 notification에 접근한다.
 *
 * OS 권한·기기 동기화·사전 안내는 온보딩과 설정이 함께 쓰는 소유물이다(architecture.md 4.4 —
 * settings → notification, onboarding → notification). 푸시 수신·탭 처리(FR-19)도 여기 있다.
 */
export { default as BellIcon } from './components/BellIcon';
export { default as NotificationPrePromptModal } from './components/NotificationPrePromptModal';
export { default as PushArrivalBanner } from './components/PushArrivalBanner';
export { useNotificationStore } from './store/notification.store';
export {
  getOsPermissionStatus,
  getPushToken,
  requestOsPermission,
} from './services/notification-permission.service';
export { syncDevicePermission } from './api/notification.api';
export { useSyncDevicePermissionMutation } from './hooks/useSyncDevicePermissionMutation';
export { usePrePromptGate } from './hooks/usePrePromptGate';
export { usePushLinkGate } from './hooks/usePushLinkGate';
/**
 * 기기 동기화·푸시 수신 기동 — app/bootstrap이 로그인 여부 판정과 라이브러리 갱신을 주입해 켠다
 * (architecture.md 5.5). notification이 auth·library를 직접 import하면 의존 표(4.4)를 어긴다.
 */
export {
  resetDeviceSync,
  startDeviceSync,
  syncDeviceNow,
} from './services/device-sync.service';
export { clearPushState, startPushReceiving } from './services/push-receiving.service';
export { NOTIFICATION_COPY } from './notification.copy';
export type { OsPermissionStatus } from './notification.types';
