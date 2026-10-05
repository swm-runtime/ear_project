import { afterEach, describe, expect, it, jest } from '@jest/globals';

type SecureStoreMock = {
  AFTER_FIRST_UNLOCK: number;
  getItemAsync: jest.Mock<(key: string, options?: unknown) => Promise<string | null>>;
  setItemAsync: jest.Mock<(key: string, value: string, options?: unknown) => Promise<void>>;
  deleteItemAsync: jest.Mock<(key: string, options?: unknown) => Promise<void>>;
};

const setup = () => {
  jest.resetModules();
  const secureStore: SecureStoreMock = {
    AFTER_FIRST_UNLOCK: 0,
    getItemAsync: jest.fn<(key: string, options?: unknown) => Promise<string | null>>().mockResolvedValue('v'),
    setItemAsync: jest.fn<(key: string, value: string, options?: unknown) => Promise<void>>().mockResolvedValue(undefined),
    deleteItemAsync: jest.fn<(key: string, options?: unknown) => Promise<void>>().mockResolvedValue(undefined),
  };
  jest.doMock('expo-secure-store', () => secureStore);
  jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
  const module = jest.requireActual<typeof import('./secure-storage')>('./secure-storage');
  return { secureStore, module };
};

afterEach(() => {
  jest.resetModules();
});

describe('secureStorage', () => {
  it('읽기·쓰기·지우기 모두 첫 잠금 해제 이후 접근성 옵션을 넘긴다', async () => {
    // given
    const { secureStore, module } = setup();
    const expected = { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK };

    // when
    await module.secureStorage.get('k');
    await module.secureStorage.set('k', 'v');
    await module.secureStorage.remove('k');

    // then
    expect(secureStore.getItemAsync).toHaveBeenCalledWith('k', expected);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith('k', 'v', expected);
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('k', expected);
  });

  it('이관이 도는 동안의 읽기는 이관이 끝난 뒤에 나간다', async () => {
    // given
    const { secureStore, module } = setup();
    let finishMigration: () => void = () => undefined;
    const migration = module.holdSecureStorageWhile(
      () =>
        new Promise<void>((resolve) => {
          finishMigration = resolve;
        }),
    );

    // when
    const read = module.secureStorage.get('auth.refresh_token');
    await Promise.resolve();
    await Promise.resolve();
    const calledBeforeFinish = secureStore.getItemAsync.mock.calls.length;
    finishMigration();
    await migration;
    await read;

    // then
    expect(calledBeforeFinish).toBe(0);
    expect(secureStore.getItemAsync).toHaveBeenCalledTimes(1);
  });
});
