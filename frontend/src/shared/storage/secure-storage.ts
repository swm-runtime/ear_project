import * as SecureStore from 'expo-secure-store';

/** expo-secure-store 래퍼. 토큰 등 비밀값은 이 모듈로만 접근한다(architecture.md 7.2). */
export const secureStorage = {
  get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  remove: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
};
