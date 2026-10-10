import { beforeEach, describe, expect, it } from '@jest/globals';

import type { LibraryItem } from '../library.types';
import { useLibraryArrivalStore } from './library-arrival.store';

const item = (source: LibraryItem['source'], addedAt: string) => ({ source, addedAt });
const old = item('drip', '2026-10-10T01:00:00Z');
const arrivals = [
  item('drip', '2026-10-11T01:00:00Z'),
  item('discovery', '2026-10-11T01:01:00Z'),
  old,
];

beforeEach(() => useLibraryArrivalStore.getState().reset());

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

  it('로그아웃 초기화 뒤 다음 계정의 첫 조회는 배지 없이 시작한다', () => {
    const store = useLibraryArrivalStore.getState();
    store.observe([old]);
    store.observe(arrivals);
    store.reset();
    store.observe(arrivals);
    expect(useLibraryArrivalStore.getState().count).toBe(0);
  });
});
