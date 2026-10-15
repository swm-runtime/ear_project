import { apiClient } from '@/shared/api/api-client';
import { DEVICE_LOCALE, DEVICE_TIMEZONE } from '@/shared/i18n/locale';
import { getDevicePlatform } from '@/shared/lib/device-platform';

import { IS_NOTIFICATION_API_MOCKED } from '../notification.constants';
import type { SyncDeviceRequestDto } from './notification.dto';
import { mockSyncDevice } from './notification.mock';

/**
 * 알림 권한·푸시 토큰 반영 — 거부했을 때도 호출한다(onboarding-api.md 4.9).
 * 호출 시점: 온보딩 사전 안내 종료 / 설정의 사전 안내 종료 / 포그라운드 복귀 동기화(notification.md 4.2).
 */
export const syncDevicePermission = async (input: {
  deviceId: string;
  pushToken: string | null;
  isOsPermissionGranted: boolean;
  appVersion: string;
}): Promise<void> => {
  if (IS_NOTIFICATION_API_MOCKED) {
    await mockSyncDevice();
    return;
  }
  const body: SyncDeviceRequestDto = {
    push_token: input.pushToken,
    // 설정 조회(settings-api.md 4.1)와 같은 값 집합 — 공용 판정을 쓴다
    platform: getDevicePlatform(),
    is_os_permission_granted: input.isOsPermissionGranted,
    app_version: input.appVersion,
    // 기기 언어·시간대 — 매 실행 이 호출이 users.language_code·timezone 의 갱신 경로다(global-api.md 4.2 · KAN-195).
    // 시장은 바뀌지 않는다. 시간대는 드립 발송 그룹에 쓰인다
    language_code: DEVICE_LOCALE,
    timezone: DEVICE_TIMEZONE,
  };
  await apiClient.put(`/users/me/devices/${input.deviceId}`, body);
};
