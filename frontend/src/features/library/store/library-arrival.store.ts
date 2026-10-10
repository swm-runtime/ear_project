import { create } from 'zustand';

import { evaluateDripArrivals } from '../library.new-arrival';
import type { LibraryItem } from '../library.types';

interface LibraryArrivalStore {
  baseline: string | null;
  count: number;
  observe: (items: readonly Pick<LibraryItem, 'source' | 'addedAt'>[]) => {
    baseline: string | null;
    newCount: number;
  };
  acknowledge: () => void;
  reset: () => void;
}

/**
 * 아직 확인하지 않은 편성 도착 수 — 탭 화면의 수명·필터와 분리해 메모리에 둔다.
 * 푸시와 목록 응답을 각각 더하지 않고, 필터 없는 첫 페이지의 addedAt 비교만 쓴다.
 * 첫 관측은 기준값만 기록하며 담기·온보딩 적립은 세지 않는다(library-api.md 4.1).
 */
export const useLibraryArrivalStore = create<LibraryArrivalStore>((set, get) => ({
  baseline: null,
  count: 0,
  observe: (items) => {
    const previous = get();
    const result = evaluateDripArrivals(items, previous.baseline);
    set({ baseline: result.baseline, count: previous.count + result.newCount });
    return result;
  },
  // 확인해도 기준값은 유지한다 — 같은 목록을 다시 받아 배지가 살아나지 않게 한다.
  acknowledge: () => set({ count: 0 }),
  reset: () => set({ baseline: null, count: 0 }),
}));
