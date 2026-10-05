import { Platform } from 'react-native';

import { runWhenAppActive } from '@/shared/lib/app-active';
import { logger } from '@/shared/lib/logger';

import { holdSecureStorageWhile, rawSecureStorage, type KeyValueStorage } from './secure-storage';
import { STORAGE_KEYS } from './storage-keys';

/**
 * 키체인 접근성 이관(architecture.md 7.2, 2026-10-05).
 *
 * `SECURE_STORE_OPTIONS` 를 `AFTER_FIRST_UNLOCK` 으로 바꿔도 **이미 저장된 항목은 그대로 `WHEN_UNLOCKED` 다** —
 * 네이티브 `set` 은 있는 항목에 값만 갱신한다. 그래서 키마다 한 번 **읽고 → 지우고 → 다시 쓴다**(새로 생기는 항목만
 * 새 접근성을 받는다). 잠금이 풀려 있어야 읽을 수 있으므로 앱이 전경일 때만 돈다.
 *
 * 값을 잃지 않는 것이 최우선이다.
 * - 지우기 전에 같은 값을 `<키>.migrating` 사본으로 먼저 쓴다. 지우고 다시 쓰는 사이에 앱이 죽어도 다음 실행이
 *   사본으로 되살린다. 다시 쓰기가 실패하면 한 번 더 시도한다.
 * - 한 키가 실패해도 다른 키는 계속한다. 하나라도 실패하면 완료 표시를 남기지 않아 다음 실행에서 다시 돈다.
 * - 완료 표시(`KEYCHAIN_ACCESSIBILITY_VERSION`)가 현재 판이면 아무것도 하지 않는다(멱등).
 */
export const KEYCHAIN_ACCESSIBILITY_VERSION = '1';

const BACKUP_SUFFIX = '.migrating';

/** 이관 대상 — 완료 표시만 뺀 모든 키. 키가 늘면 저절로 포함된다(convention.md 4.3 — 키는 한 곳에서만 관리) */
export const KEYCHAIN_MIGRATION_KEYS: readonly string[] = Object.values(STORAGE_KEYS).filter(
  (key) => key !== STORAGE_KEYS.KEYCHAIN_ACCESSIBILITY_VERSION,
);

export type KeychainMigrationResult =
  | { status: 'already-done' }
  | { status: 'done' }
  | { status: 'partial'; failedKeys: string[] };

const setWithRetry = async (storage: KeyValueStorage, key: string, value: string): Promise<void> => {
  try {
    await storage.set(key, value);
  } catch {
    await storage.set(key, value);
  }
};

const migrateKey = async (storage: KeyValueStorage, key: string): Promise<void> => {
  const backupKey = `${key}${BACKUP_SUFFIX}`;
  const value = await storage.get(key);

  if (value === null) {
    // 지난 이관이 지우고 다시 쓰기 전에 끊겼다면 사본이 남아 있다 — 되살린다
    const backup = await storage.get(backupKey);
    if (backup === null) return;
    await setWithRetry(storage, key, backup);
    await storage.remove(backupKey);
    return;
  }

  // 사본이 쓰이지 않았으면 원본을 지우지 않는다(여기서 던지면 원본은 그대로다)
  await storage.set(backupKey, value);
  await storage.remove(key);
  await setWithRetry(storage, key, value);
  await storage.remove(backupKey);
};

export const migrateKeychainAccessibility = async (
  storage: KeyValueStorage,
  keys: readonly string[] = KEYCHAIN_MIGRATION_KEYS,
  markerKey: string = STORAGE_KEYS.KEYCHAIN_ACCESSIBILITY_VERSION,
): Promise<KeychainMigrationResult> => {
  if ((await storage.get(markerKey)) === KEYCHAIN_ACCESSIBILITY_VERSION) {
    return { status: 'already-done' };
  }

  const failedKeys: string[] = [];
  for (const key of keys) {
    try {
      await migrateKey(storage, key);
    } catch (error) {
      failedKeys.push(key);
      logger.warn('[storage] keychain migration failed for a key', key, error);
    }
  }
  if (failedKeys.length > 0) return { status: 'partial', failedKeys };

  await storage.set(markerKey, KEYCHAIN_ACCESSIBILITY_VERSION);
  return { status: 'done' };
};

let isStarted = false;

/**
 * 앱 시작 때 한 번 — **다른 저장소 접근보다 먼저** 부른다(`App.tsx` 최상단). 전경이면 곧바로, 백그라운드로
 * 떠 있으면(프리웜·백그라운드 실행 — 기기가 잠겨 있을 수 있다) 처음 전경이 될 때 돈다. 도는 동안 `secureStorage`
 * 호출은 끝나길 기다린다. iOS 만 — Android·웹에는 키체인 접근성이 없다.
 */
export const startKeychainMigration = (): void => {
  if (Platform.OS !== 'ios' || isStarted) return;
  isStarted = true;
  runWhenAppActive(() => {
    void holdSecureStorageWhile(() => migrateKeychainAccessibility(rawSecureStorage))
      .then((result) => {
        if (result.status === 'partial') {
          logger.warn('[storage] keychain migration partial — retry next launch', result.failedKeys);
        }
      })
      .catch((error) => logger.warn('[storage] keychain migration failed', error));
  });
};
