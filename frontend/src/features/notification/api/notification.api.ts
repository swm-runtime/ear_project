import { apiClient } from '@/shared/api/api-client';
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
  };
  await apiClient.put(`/users/me/devices/${input.deviceId}`, body);
};
