import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface KeyValueStorage {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

/**
 * 키체인 접근성 — **첫 잠금 해제 이후(`AFTER_FIRST_UNLOCK`)**(architecture.md 7.2, 2026-10-05).
 *
 * 기본값(`WHEN_UNLOCKED`)은 기기가 잠겨 있으면 읽기·쓰기가 전부 `User interaction is not allowed` 로 실패한다.
 * 이 앱은 잠금 화면에서 오디오를 계속 재생하고, 그 사이 access token(30분)이 만료되면 토큰 갱신이 기기 id·토큰을
 * 키체인에서 읽고 써야 한다 — 기본값이면 갱신이 실패해 **듣는 도중 로그아웃**됐다. 재부팅 뒤 한 번도 풀지 않은
 * 기기에서만 막히는 단계로 낮춘다. 기기 이전·백업 복원에는 따라간다(종전과 같다 — `THIS_DEVICE_ONLY` 아님).
 *
 * 세 동작 모두에 같은 값을 넘긴다. Android 는 이 옵션을 무시한다.
 * **기존 항목의 접근성은 쓰기만으로 바뀌지 않는다** — 네이티브 `set` 이 이미 있는 항목에는 값만 갱신한다
 * (`SecItemUpdate` — `kSecAttrAccessible` 미변경). 그래서 한 번 지우고 다시 쓰는 이관이 따로 있다(`keychain-migration.ts`).
 */
export const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/**
 * expo-secure-store는 Android·iOS·tvOS만 지원한다(SDK 57 문서). 웹 번들에서는 네이티브
 * 모듈이 빈 객체라 `getItemAsync`·`setItemAsync`가 곧바로 예외를 던진다.
 *
 * 웹은 UI 확인용으로만 띄우므로 localStorage로 대체한다. **비밀값 보관 수준이 아니다** —
 * 실제 기기에서는 아래 SecureStore 경로만 쓰인다(architecture.md 7.2).
 */
const webStorage: KeyValueStorage = {
  get: (key) => Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  set: (key, value) => {
    globalThis.localStorage?.setItem(key, value);
    return Promise.resolve();
  },
  remove: (key) => {
    globalThis.localStorage?.removeItem(key);
    return Promise.resolve();
  },
};

const nativeStorage: KeyValueStorage = {
  get: (key) => SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS),
  remove: (key) => SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS),
};

/**
 * 이관이 도는 동안 다른 읽기·쓰기를 세워 두는 관문. 이관은 항목을 **지웠다가 다시 쓰므로**, 그 틈에 세션 복원이
 * 토큰을 읽으면 "없음"으로 보고 로그아웃 처리한다. 이관이 없을 때는 기다리지 않는다.
 */
let barrier: Promise<void> | null = null;

/** `task` 가 끝날 때까지 `secureStorage` 의 모든 호출을 기다리게 한다. `task` 안에서는 `rawSecureStorage` 를 쓴다 */
export const holdSecureStorageWhile = <T>(task: () => Promise<T>): Promise<T> => {
  const run = (barrier ?? Promise.resolve()).then(task);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  barrier = settled;
  void settled.then(() => {
    if (barrier === settled) barrier = null;
  });
  return run;
};

const waitForBarrier = async (): Promise<void> => {
  while (barrier) await barrier;
};

const gated = (storage: KeyValueStorage): KeyValueStorage => ({
  get: async (key) => {
    await waitForBarrier();
    return storage.get(key);
  },
  set: async (key, value) => {
    await waitForBarrier();
    return storage.set(key, value);
  },
  remove: async (key) => {
    await waitForBarrier();
    return storage.remove(key);
  },
});

/** 관문을 거치지 않는 저장소 — 키체인 이관(`keychain-migration.ts`) 전용이다. 다른 곳에서 쓰지 않는다 */
export const rawSecureStorage: KeyValueStorage = Platform.OS === 'web' ? webStorage : nativeStorage;

/** expo-secure-store 래퍼. 토큰 등 비밀값은 이 모듈로만 접근한다(architecture.md 7.2). */
export const secureStorage: KeyValueStorage =
  Platform.OS === 'web' ? webStorage : gated(nativeStorage);
