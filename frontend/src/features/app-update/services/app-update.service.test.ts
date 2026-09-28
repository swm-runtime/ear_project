/**
 * 버전 관문 판정 반영 테스트(splash.md 4.1·7장 — 강제/권장/fail-open, KAN-99).
 * 판정 자체는 서버 몫이라 API 는 결과(verdict)로 흉내 낸다. 규칙 소유: splash.md 4 · README 결정 39.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { checkAppVersionGate } from './app-update.service';
import type { VersionGateVerdict } from '../api/app-version.dto';
import { useAppUpdateStore } from '../store/app-update.store';

// jest.mock 은 호이스팅되므로 위 import 보다 먼저 적용된다 — mock 변수는 `mock` 접두어라 팩토리에서 참조할 수 있다
const mockFetchVersionGate = jest.fn<() => Promise<VersionGateVerdict>>();
jest.mock('../api/app-version.api', () => ({
  fetchVersionGate: () => mockFetchVersionGate(),
}));

const mockStorage = new Map<string, string>();
jest.mock('@/shared/storage/secure-storage', () => ({
  secureStorage: {
    get: (key: string) => Promise.resolve(mockStorage.get(key) ?? null),
    set: (key: string, value: string) => {
      mockStorage.set(key, value);
      return Promise.resolve();
    },
    remove: (key: string) => {
      mockStorage.delete(key);
      return Promise.resolve();
    },
  },
}));

const resetStore = () =>
  useAppUpdateStore.setState({ gate: 'pending', isRecommendVisible: false, hasShownRecommend: false });

describe('checkAppVersionGate', () => {
  beforeEach(() => {
    mockStorage.clear();
    mockFetchVersionGate.mockReset();
    resetStore();
  });

  it('최신 버전이면 통과하고 권장 안내를 띄우지 않는다', async () => {
    // given
    mockFetchVersionGate.mockResolvedValue({ kind: 'ok', updateAvailable: false, latestVersion: '1.1.0' });
    // when
    await checkAppVersionGate();
    // then
    expect(useAppUpdateStore.getState().gate).toBe('passed');
    expect(useAppUpdateStore.getState().isRecommendVisible).toBe(false);
  });

  it('최소 이상·최신 미만이면 통과하되 권장 안내를 한 번만 띄운다', async () => {
    // given
    mockFetchVersionGate.mockResolvedValue({ kind: 'ok', updateAvailable: true, latestVersion: '9.9.9' });
    // when
    await checkAppVersionGate();
    // then
    expect(useAppUpdateStore.getState().gate).toBe('passed');
    expect(useAppUpdateStore.getState().isRecommendVisible).toBe(true);
    // when — 닫고 30분 복귀 재검사가 같은 답을 줘도
    useAppUpdateStore.getState().dismissRecommend();
    await checkAppVersionGate();
    // then — 다시 뜨지 않는다
    expect(useAppUpdateStore.getState().isRecommendVisible).toBe(false);
  });

  it('서버가 426 을 주면 required 가 되고 이후 조회는 다시 묻지 않는다', async () => {
    // given
    mockFetchVersionGate.mockResolvedValue({ kind: 'required' });
    // when
    await checkAppVersionGate();
    await checkAppVersionGate();
    // then
    expect(useAppUpdateStore.getState().gate).toBe('required');
    expect(mockFetchVersionGate).toHaveBeenCalledTimes(1);
  });

  it('판정 불가(망·5xx·타임아웃)이고 캐시가 없으면 막지 않고 통과한다(fail-open)', async () => {
    // given
    mockFetchVersionGate.mockResolvedValue({ kind: 'unknown' });
    // when
    await checkAppVersionGate();
    // then
    expect(useAppUpdateStore.getState().gate).toBe('passed');
    expect(useAppUpdateStore.getState().isRecommendVisible).toBe(false);
  });

  it('판정 불가면 마지막 성공 판정(캐시)으로 판정한다 — 직전이 426 이었으면 막는다', async () => {
    // given — 앞선 실행에서 426 을 받아 저장됐다
    mockFetchVersionGate.mockResolvedValueOnce({ kind: 'required' });
    await checkAppVersionGate();
    resetStore();
    mockFetchVersionGate.mockResolvedValueOnce({ kind: 'unknown' });
    // when
    await checkAppVersionGate();
    // then
    expect(useAppUpdateStore.getState().gate).toBe('required');
  });

  it('동시에 두 번 부르면 조회는 한 번만 나간다', async () => {
    // given
    mockFetchVersionGate.mockResolvedValue({ kind: 'ok', updateAvailable: false, latestVersion: '1.1.0' });
    // when
    await Promise.all([checkAppVersionGate(), checkAppVersionGate()]);
    // then
    expect(mockFetchVersionGate).toHaveBeenCalledTimes(1);
  });
});
