/**
 * notification feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 notification에 접근한다.
 *
 * 푸시 본기능(FR-19, P1)의 본개발 전이지만, OS 권한 스텁·기기 동기화·사전 안내는
 * 온보딩과 설정이 함께 쓰는 소유물이라 먼저 이 feature로 모았다(architecture.md 4.4 —
 * settings → notification, onboarding → notification).
 */
export { default as NotificationPrePromptModal } from './components/NotificationPrePromptModal';
export {
  getOsPermissionStatus,
  getPushToken,
  requestOsPermission,
} from './services/notification-permission.service';
export { syncDevicePermission } from './api/notification.api';
export { useSyncDevicePermissionMutation } from './hooks/useSyncDevicePermissionMutation';
export { NOTIFICATION_COPY } from './notification.copy';
export type { OsPermissionStatus } from './notification.types';
