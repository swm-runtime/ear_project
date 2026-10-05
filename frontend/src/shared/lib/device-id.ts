import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import { generateId } from './generate-id';

/**
 * 한 번 읽거나 만든 기기 식별자는 메모리에 둔다(2026-10-05). 토큰 갱신이 매번 이 값을 쓰는데, 잠금 화면 재생 중의
 * 갱신에서 키체인을 다시 읽으면 기기 잠금에 걸릴 수 있다 — 앱 수명 안에서는 값이 바뀌지 않으므로 다시 읽을 이유가 없다.
 * 동시에 두 번 불려도 새 id 를 둘 만들지 않도록 진행 중인 조회를 함께 쓴다. 실패한 조회는 기억하지 않는다.
 */
let cachedDeviceId: string | null = null;
let pending: Promise<string> | null = null;

const loadDeviceId = async (): Promise<string> => {
  const existing = await secureStorage.get(STORAGE_KEYS.DEVICE_ID);
  if (existing) return existing;

  const deviceId = generateId();
  await secureStorage.set(STORAGE_KEYS.DEVICE_ID, deviceId);
  return deviceId;
};

/**
 * 기기 식별자 — 푸시 토큰 매핑용(auth-api.md 4.1). 최초 실행 시 생성해 영속한다.
 * TODO: expo-application 등 플랫폼 식별자 도입 여부는 notification 명세 확정 시 재검토.
 */
export const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;
  pending ??= loadDeviceId()
    .then((deviceId) => {
      cachedDeviceId = deviceId;
      return deviceId;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
};
