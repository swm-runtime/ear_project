import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * expo-secure-store는 Android·iOS·tvOS만 지원한다(SDK 57 문서). 웹 번들에서는 네이티브
 * 모듈이 빈 객체라 `getItemAsync`·`setItemAsync`가 곧바로 예외를 던진다.
 *
 * 웹은 UI 확인용으로만 띄우므로 localStorage로 대체한다. **비밀값 보관 수준이 아니다** —
 * 실제 기기에서는 아래 SecureStore 경로만 쓰인다(architecture.md 7.2).
 */
const webStorage = {
  get: (key: string): Promise<string | null> =>
    Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  set: (key: string, value: string): Promise<void> => {
    globalThis.localStorage?.setItem(key, value);
    return Promise.resolve();
  },
  remove: (key: string): Promise<void> => {
    globalThis.localStorage?.removeItem(key);
    return Promise.resolve();
  },
};

const nativeStorage = {
  get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  remove: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
};

/** expo-secure-store 래퍼. 토큰 등 비밀값은 이 모듈로만 접근한다(architecture.md 7.2). */
export const secureStorage = Platform.OS === 'web' ? webStorage : nativeStorage;
