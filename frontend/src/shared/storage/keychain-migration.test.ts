import { describe, expect, it, jest } from '@jest/globals';

import { KEYCHAIN_ACCESSIBILITY_VERSION, migrateKeychainAccessibility } from './keychain-migration';
import type { KeyValueStorage } from './secure-storage';

jest.mock('@/shared/lib/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('./secure-storage', () => ({
  holdSecureStorageWhile: jest.fn(),
  rawSecureStorage: {},
}));

const MARKER = 'storage.keychain_accessibility_version';

/**
 * 키체인 흉내 — 항목마다 접근성을 기억한다. 네이티브와 같이 **이미 있는 항목에 쓰면 값만 바뀌고 접근성은
 * 그대로**이고(SecItemUpdate), 지운 뒤 새로 쓴 항목만 새 접근성(`new`)을 받는다
 */
const createKeychain = (seed: Record<string, string>) => {
  const items = new Map<string, { value: string; accessibility: 'old' | 'new' }>(
    Object.entries(seed).map(([key, value]) => [key, { value, accessibility: 'old' as const }]),
  );
  const failSet = new Map<string, number>();
  const storage: KeyValueStorage = {
    get: (key) => Promise.resolve(items.get(key)?.value ?? null),
    set: (key, value) => {
      const remaining = failSet.get(key) ?? 0;
      if (remaining > 0) {
        failSet.set(key, remaining - 1);
        return Promise.reject(new Error('I/O error.'));
      }
      const existing = items.get(key);
      items.set(key, { value, accessibility: existing?.accessibility ?? 'new' });
      return Promise.resolve();
    },
    remove: (key) => {
      items.delete(key);
      return Promise.resolve();
    },
  };
  return {
    storage,
    items,
    /** `key` 쓰기를 `times` 번 실패시킨다 */
    failSetOf: (key: string, times: number) => failSet.set(key, times),
  };
};

describe('키체인 접근성 이관', () => {
  it('저장된 모든 값이 같은 값 그대로 새 접근성으로 다시 쓰이고 완료 표시가 남는다', async () => {
    // given
    const keychain = createKeychain({ 'auth.refresh_token': 'r1', 'device.id': 'd1' });

    // when
    const result = await migrateKeychainAccessibility(
      keychain.storage,
      ['auth.refresh_token', 'device.id', 'nav.last_tab'],
      MARKER,
    );

    // then
    expect(result).toEqual({ status: 'done' });
    expect(keychain.items.get('auth.refresh_token')).toEqual({ value: 'r1', accessibility: 'new' });
    expect(keychain.items.get('device.id')).toEqual({ value: 'd1', accessibility: 'new' });
    expect(keychain.items.has('nav.last_tab')).toBe(false);
    expect(keychain.items.get(MARKER)?.value).toBe(KEYCHAIN_ACCESSIBILITY_VERSION);
    expect([...keychain.items.keys()].some((key) => key.endsWith('.migrating'))).toBe(false);
  });

  it('완료 표시가 현재 판이면 아무 항목도 건드리지 않는다', async () => {
    // given
    const keychain = createKeychain({
      'auth.refresh_token': 'r1',
      [MARKER]: KEYCHAIN_ACCESSIBILITY_VERSION,
    });
    const setSpy = jest.spyOn(keychain.storage, 'set');
    const removeSpy = jest.spyOn(keychain.storage, 'remove');

    // when
    const result = await migrateKeychainAccessibility(keychain.storage, ['auth.refresh_token'], MARKER);

    // then
    expect(result).toEqual({ status: 'already-done' });
    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('다시 쓰기가 한 번 실패하면 한 번 더 써서 값을 지킨다', async () => {
    // given
    const keychain = createKeychain({ 'auth.refresh_token': 'r1' });
    // 첫 set 은 사본 쓰기라 원본 키의 실패는 지운 뒤의 다시 쓰기에서 난다
    keychain.failSetOf('auth.refresh_token', 1);

    // when
    const result = await migrateKeychainAccessibility(keychain.storage, ['auth.refresh_token'], MARKER);

    // then
    expect(result).toEqual({ status: 'done' });
    expect(keychain.items.get('auth.refresh_token')).toEqual({ value: 'r1', accessibility: 'new' });
  });

  it('한 키의 다시 쓰기가 끝내 실패해도 값은 사본에 남고, 다른 키는 이관되며, 완료 표시는 남지 않는다', async () => {
    // given
    const keychain = createKeychain({ 'auth.refresh_token': 'r1', 'device.id': 'd1' });
    keychain.failSetOf('auth.refresh_token', 2);

    // when
    const result = await migrateKeychainAccessibility(
      keychain.storage,
      ['auth.refresh_token', 'device.id'],
      MARKER,
    );

    // then
    expect(result).toEqual({ status: 'partial', failedKeys: ['auth.refresh_token'] });
    expect(keychain.items.get('auth.refresh_token.migrating')?.value).toBe('r1');
    expect(keychain.items.get('device.id')).toEqual({ value: 'd1', accessibility: 'new' });
    expect(keychain.items.has(MARKER)).toBe(false);
  });

  it('지난 이관이 지우고 끊겼으면 다음 이관이 사본으로 값을 되살리고 완료한다', async () => {
    // given — 원본은 지워졌고 사본만 남았다
    const keychain = createKeychain({});
    await keychain.storage.set('auth.refresh_token.migrating', 'r1');

    // when
    const result = await migrateKeychainAccessibility(keychain.storage, ['auth.refresh_token'], MARKER);

    // then
    expect(result).toEqual({ status: 'done' });
    expect(keychain.items.get('auth.refresh_token')).toEqual({ value: 'r1', accessibility: 'new' });
    expect(keychain.items.has('auth.refresh_token.migrating')).toBe(false);
  });

  it('사본 쓰기가 실패하면 원본을 지우지 않는다', async () => {
    // given
    const keychain = createKeychain({ 'auth.refresh_token': 'r1' });
    keychain.failSetOf('auth.refresh_token.migrating', 1);

    // when
    const result = await migrateKeychainAccessibility(keychain.storage, ['auth.refresh_token'], MARKER);

    // then
    expect(result).toEqual({ status: 'partial', failedKeys: ['auth.refresh_token'] });
    expect(keychain.items.get('auth.refresh_token')).toEqual({ value: 'r1', accessibility: 'old' });
  });

  it('두 번 돌려도 값이 바뀌지 않는다', async () => {
    // given
    const keychain = createKeychain({ 'auth.refresh_token': 'r1' });
    await migrateKeychainAccessibility(keychain.storage, ['auth.refresh_token'], MARKER);
    const snapshot = new Map(keychain.items);

    // when
    const result = await migrateKeychainAccessibility(keychain.storage, ['auth.refresh_token'], MARKER);

    // then
    expect(result).toEqual({ status: 'already-done' });
    expect(keychain.items).toEqual(snapshot);
  });
});
