import { create } from 'zustand';

import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import { evaluateDripArrivals } from '../library.new-arrival';
import type { LibraryItem } from '../library.types';

interface LibraryArrivalStore {
  userId: string | null;
  ready: boolean;
  baseline: string | null;
  count: number;
  activate: (userId: string) => Promise<void>;
  observe: (items: readonly Pick<LibraryItem, 'source' | 'addedAt'>[]) => {
    baseline: string | null;
    newCount: number;
  };
  acknowledge: () => void;
  reset: () => void;
}

type Snapshot = Pick<LibraryArrivalStore, 'baseline' | 'count'>;
const EMPTY: Snapshot = { baseline: null, count: 0 };
const storageKey = (userId: string) => `${STORAGE_KEYS.LIBRARY_ARRIVAL}.${userId}`;
const parseSnapshot = (raw: string | null): Snapshot => {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<Snapshot> | null;
    if (
      !value ||
      (value.baseline !== null &&
        (typeof value.baseline !== 'string' || !Number.isFinite(Date.parse(value.baseline)))) ||
      !Number.isSafeInteger(value.count) ||
      (value.count ?? -1) < 0
    )
      return EMPTY;
    return { baseline: value.baseline, count: value.count } as Snapshot;
  } catch {
    return EMPTY;
  }
};

// 비동기 쓰기의 완료 순서가 뒤집혀 확인 전 배지가 되살아나지 않도록 직렬화한다.
let writes: Promise<void> = Promise.resolve();
const persist = (state: LibraryArrivalStore): void => {
  if (!state.ready || !state.userId) return;
  const key = storageKey(state.userId);
  const snapshot = JSON.stringify({ baseline: state.baseline, count: state.count });
  writes = writes
    .then(() => secureStorage.set(key, snapshot))
    .catch((error) => logger.warn('[library] arrival badge save failed', error));
};
let restoreVersion = 0;
let pendingRestore: { userId: string; promise: Promise<void> } | null = null;

/**
 * 아직 확인하지 않은 편성 도착 수 — 계정별 로컬 저장으로 앱 종료 뒤에도 이어진다.
 * 푸시와 목록 응답을 각각 더하지 않고, 필터 없는 첫 페이지의 addedAt 비교만 쓴다.
 * 첫 관측은 기준값만 기록하며 담기·온보딩 적립은 세지 않는다(library-api.md 4.1).
 */
export const useLibraryArrivalStore = create<LibraryArrivalStore>((set, get) => ({
  userId: null,
  ready: false,
  baseline: null,
  count: 0,
  activate: (userId) => {
    if (get().userId === userId && get().ready) return Promise.resolve();
    if (pendingRestore?.userId === userId) return pendingRestore.promise;
    const version = ++restoreVersion;
    set({ userId, ready: false, ...EMPTY });
    const promise = (async () => {
      let snapshot = EMPTY;
      try {
        await writes;
        snapshot = parseSnapshot(await secureStorage.get(storageKey(userId)));
      } catch (error) {
        logger.warn('[library] arrival badge restore failed', error);
      }
      // 로그아웃·계정 전환 뒤 늦게 끝난 복원은 현재 계정을 덮어쓰지 않는다.
      if (version === restoreVersion) set({ ...snapshot, ready: true });
    })();
    pendingRestore = { userId, promise };
    return promise;
  },
  observe: (items) => {
    const previous = get();
    if (!previous.ready) return { baseline: previous.baseline, newCount: 0 };
    const result = evaluateDripArrivals(items, previous.baseline);
    set({ baseline: result.baseline, count: previous.count + result.newCount });
    if (result.baseline !== previous.baseline || result.newCount > 0) persist(get());
    return result;
  },
  // 확인해도 기준값은 유지한다 — 같은 목록을 다시 받아 배지가 살아나지 않게 한다.
  acknowledge: () => {
    set({ count: 0 });
    persist(get());
  },
  // 저장값은 남기되 활성 계정의 메모리·진행 중 복원만 비운다.
  reset: () => {
    ++restoreVersion;
    pendingRestore = null;
    set({ userId: null, ready: false, ...EMPTY });
  },
}));
