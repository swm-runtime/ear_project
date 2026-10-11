import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { secureStorage } from '@/shared/storage/secure-storage';

import type { LibraryItem } from '../library.types';
import { useLibraryArrivalStore } from './library-arrival.store';

const item = (source: LibraryItem['source'], addedAt: string) => ({ source, addedAt });
const mockStorage = new Map<string, string>();
jest.mock('@/shared/storage/secure-storage', () => ({
  secureStorage: {
    get: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
  },
}));
jest.mock('@/shared/lib/logger', () => ({ logger: { warn: jest.fn() } }));
const old = item('drip', '2026-10-10T01:00:00Z');
const arrivals = [
  item('drip', '2026-10-11T01:00:00Z'),
  item('discovery', '2026-10-11T01:01:00Z'),
  old,
];

beforeEach(async () => {
  // 앞 테스트의 비동기 저장을 끝낸 뒤 독립된 기기로 시작한다.
  await useLibraryArrivalStore.getState().activate('drain');
  jest.clearAllMocks();
  mockStorage.clear();
  useLibraryArrivalStore.getState().reset();
  await useLibraryArrivalStore.getState().activate('a');
});

describe('라이브러리 탭의 새 도착 수', () => {
  it('첫 조회를 전부 새 것으로 표시하지 않고, 정규·탐험만 센다', () => {
    const store = useLibraryArrivalStore.getState();
    store.observe([old]);
    expect(useLibraryArrivalStore.getState().count).toBe(0);
    store.observe([...arrivals, item('save', '2026-10-11T02:00:00Z')]);
    expect(useLibraryArrivalStore.getState().count).toBe(2);
  });

  it('푸시 갱신·다음 페이지·재조회로 같은 첫 페이지를 반복 관측해도 중복으로 더하지 않는다', () => {
    const store = useLibraryArrivalStore.getState();
    store.observe([old]);
    store.observe(arrivals);
    store.observe(arrivals);
    store.observe(arrivals);
    expect(useLibraryArrivalStore.getState().count).toBe(2);
  });

  it('확인 전의 여러 도착은 누적하고, 탭 확인 뒤 재조회해도 배지가 살아나지 않는다', () => {
    const store = useLibraryArrivalStore.getState();
    store.observe([old]);
    store.observe(arrivals);
    store.observe([item('drip', '2026-10-11T03:00:00Z'), ...arrivals]);
    expect(useLibraryArrivalStore.getState().count).toBe(3);
    store.acknowledge();
    store.observe([item('drip', '2026-10-11T03:00:00Z'), ...arrivals]);
    expect(useLibraryArrivalStore.getState().count).toBe(0);
    store.observe([item('discovery', '2026-10-11T04:00:00Z'), ...arrivals]);
    expect(useLibraryArrivalStore.getState().count).toBe(1);
  });

  it('빈 응답·오래된 캐시는 미확인 수와 기준을 되돌리지 않는다', () => {
    const store = useLibraryArrivalStore.getState();
    store.observe([old]);
    store.observe(arrivals);
    store.observe([]);
    store.observe([old]);
    expect(useLibraryArrivalStore.getState()).toMatchObject({
      count: 2,
      baseline: arrivals[1].addedAt,
    });
  });

  it('로그아웃 초기화 뒤 다음 계정의 첫 조회는 배지 없이 시작한다', async () => {
    const store = useLibraryArrivalStore.getState();
    store.observe([old]);
    store.observe(arrivals);
    store.reset();
    await store.activate('b');
    store.observe(arrivals);
    expect(useLibraryArrivalStore.getState().count).toBe(0);
  });

  it('완전 종료 중 도착한 2편을 저장한 기준값과 비교해 센다', async () => {
    const store = useLibraryArrivalStore.getState();
    store.observe([old]);
    store.reset();
    await store.activate('a');
    store.observe(arrivals);
    expect(useLibraryArrivalStore.getState().count).toBe(2);
  });

  it('종료 전 미확인 배지는 복원하고 같은 목록을 중복 집계하지 않는다', async () => {
    const store = useLibraryArrivalStore.getState();
    store.observe([old]);
    store.observe(arrivals);
    store.reset();
    await store.activate('a');
    store.observe(arrivals);
    expect(useLibraryArrivalStore.getState().count).toBe(2);
  });

  it('확인 직후 종료해도 저장 순서를 지켜 배지가 다시 뜨지 않는다', async () => {
    const store = useLibraryArrivalStore.getState();
    store.observe([old]);
    store.observe(arrivals);
    store.acknowledge();
    store.reset();
    await store.activate('a');
    store.observe(arrivals);
    expect(useLibraryArrivalStore.getState().count).toBe(0);
  });

  it('다른 계정과 분리하고 원래 계정으로 돌아오면 그 계정의 배지를 복원한다', async () => {
    const store = useLibraryArrivalStore.getState();
    store.observe([old]);
    store.observe(arrivals);
    store.reset();
    await store.activate('b');
    store.observe(arrivals);
    expect(useLibraryArrivalStore.getState().count).toBe(0);
    store.reset();
    await store.activate('a');
    expect(useLibraryArrivalStore.getState().count).toBe(2);
  });

  it('복원 전 목록을 기준값으로 덮지 않고, 로그아웃 후 늦게 끝난 복원도 버린다', async () => {
    const store = useLibraryArrivalStore.getState();
    let finish!: (value: string | null) => void;
    jest.mocked(secureStorage.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    store.reset();
    const restoring = store.activate('a');
    await Promise.resolve();
    store.observe(arrivals);
    expect(useLibraryArrivalStore.getState()).toMatchObject({
      ready: false,
      baseline: null,
      count: 0,
    });
    store.reset();
    finish(JSON.stringify({ baseline: old.addedAt, count: 2 }));
    await restoring;
    expect(useLibraryArrivalStore.getState()).toMatchObject({
      userId: null,
      ready: false,
      count: 0,
    });
  });

  it('손상된 저장값은 버리고 첫 목록으로 기준값을 다시 잡는다', async () => {
    const store = useLibraryArrivalStore.getState();
    mockStorage.set('library.arrival.b', '{broken');
    await store.activate('b');
    store.observe(arrivals);
    expect(useLibraryArrivalStore.getState()).toMatchObject({ ready: true, count: 0 });
  });
});
