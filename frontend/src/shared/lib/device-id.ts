import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import { generateId } from './generate-id';

/**
 * 기기 식별자 — 푸시 토큰 매핑용(auth-api.md 4.1). 최초 실행 시 생성해 영속한다.
 * TODO: expo-application 등 플랫폼 식별자 도입 여부는 notification 명세 확정 시 재검토.
 */
export const getDeviceId = async (): Promise<string> => {
  const existing = await secureStorage.get(STORAGE_KEYS.DEVICE_ID);
  if (existing) return existing;

  const deviceId = generateId();
  await secureStorage.set(STORAGE_KEYS.DEVICE_ID, deviceId);
  return deviceId;
};
