import { afterEach, describe, expect, it, jest } from '@jest/globals';

const setup = (stored: string | null) => {
  jest.resetModules();
  const storage = {
    get: jest.fn<(key: string) => Promise<string | null>>().mockResolvedValue(stored),
    set: jest.fn<(key: string, value: string) => Promise<void>>().mockResolvedValue(undefined),
    remove: jest.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
  };
  jest.doMock('@/shared/storage/secure-storage', () => ({ secureStorage: storage }));
  jest.doMock('./generate-id', () => ({ generateId: () => 'new-device-id' }));
  const { getDeviceId } = jest.requireActual<typeof import('./device-id')>('./device-id');
  return { storage, getDeviceId };
};

afterEach(() => {
  jest.resetModules();
});

describe('getDeviceId', () => {
  it('한 번 읽은 뒤에는 저장소를 다시 읽지 않는다 — 잠금 화면 갱신이 키체인에 닿지 않는다', async () => {
    // given
    const { storage, getDeviceId } = setup('saved-id');

    // when
    const first = await getDeviceId();
    storage.get.mockRejectedValue(new Error('User interaction is not allowed.'));
    const second = await getDeviceId();

    // then
    expect(first).toBe('saved-id');
    expect(second).toBe('saved-id');
    expect(storage.get).toHaveBeenCalledTimes(1);
  });

  it('없으면 한 번만 만들어 저장한다 — 동시에 불려도 둘을 만들지 않는다', async () => {
    // given
    const { storage, getDeviceId } = setup(null);

    // when
    const [a, b] = await Promise.all([getDeviceId(), getDeviceId()]);

    // then
    expect(a).toBe('new-device-id');
    expect(b).toBe('new-device-id');
    expect(storage.set).toHaveBeenCalledTimes(1);
  });

  it('읽기가 실패하면 기억하지 않고 다음 호출이 다시 읽는다', async () => {
    // given
    const { storage, getDeviceId } = setup('saved-id');
    storage.get.mockRejectedValueOnce(new Error('User interaction is not allowed.'));

    // when
    await expect(getDeviceId()).rejects.toThrow('User interaction is not allowed.');
    const retried = await getDeviceId();

    // then
    expect(retried).toBe('saved-id');
    expect(storage.set).not.toHaveBeenCalled();
  });
});
