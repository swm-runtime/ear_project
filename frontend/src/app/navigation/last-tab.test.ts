import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import { readTabToRestore, rememberTab } from './last-tab';

jest.mock('@/shared/storage/secure-storage', () => ({
  secureStorage: { get: jest.fn(), set: jest.fn(() => Promise.resolve()), remove: jest.fn() },
}));

const mockGet = secureStorage.get as jest.Mock<() => Promise<string | null>>;
const THIRTY_MIN = 30 * 60 * 1000;

describe('마지막 탭 복원 판정', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('30분 이내 기록이면 그 탭을 돌려준다', async () => {
    mockGet.mockResolvedValue(`Explore:${Date.now() - 60_000}`);
    await expect(readTabToRestore()).resolves.toBe('Explore');
  });

  it('30분이 지나면 복원하지 않는다 — 어제 본 탭이 뜨면 편의가 아니라 어색함이다', async () => {
    mockGet.mockResolvedValue(`Explore:${Date.now() - THIRTY_MIN - 1}`);
    await expect(readTabToRestore()).resolves.toBeNull();
  });

  it('경계(정확히 30분)는 복원한다', async () => {
    mockGet.mockResolvedValue(`Profile:${Date.now() - THIRTY_MIN + 50}`);
    await expect(readTabToRestore()).resolves.toBe('Profile');
  });

  it('미래 시각이면 버린다 — 시계를 뒤로 돌린 기기에서 만료 판정이 성립하지 않는다', async () => {
    mockGet.mockResolvedValue(`Library:${Date.now() + 60_000}`);
    await expect(readTabToRestore()).resolves.toBeNull();
  });

  it('기록이 없으면 null 이다', async () => {
    mockGet.mockResolvedValue(null);
    await expect(readTabToRestore()).resolves.toBeNull();
  });

  it('복원 대상이 아닌 화면 이름은 버린다 — 탭이 아닌 값이 들어오면 내비게이터가 깨진다', async () => {
    mockGet.mockResolvedValue(`Settings:${Date.now()}`);
    await expect(readTabToRestore()).resolves.toBeNull();
  });

  it('형식이 깨진 값은 버린다', async () => {
    for (const bad of ['Explore', ':123', 'Explore:', 'Explore:abc', '']) {
      mockGet.mockResolvedValue(bad);
      await expect(readTabToRestore()).resolves.toBeNull();
    }
  });

  it('저장소가 던져도 null 로 떨어진다 — 복원 실패가 앱 실행을 막으면 안 된다', async () => {
    mockGet.mockRejectedValue(new Error('storage unavailable'));
    await expect(readTabToRestore()).resolves.toBeNull();
  });

  it('기록은 탭과 시각을 함께 남긴다', () => {
    rememberTab('Library');
    expect(secureStorage.set).toHaveBeenCalledWith(
      STORAGE_KEYS.LAST_TAB,
      expect.stringMatching(/^Library:\d+$/),
    );
  });
});
