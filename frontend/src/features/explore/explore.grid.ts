import { exploreEntryKey } from './explore.entry';
import type { ExploreEntry } from './explore.types';

/**
 * 두 칸 썸네일 격자용 데이터(2026-09-18) — 홀수면 빈 칸(null)을 하나 채운다.
 * `numColumns={2}`의 마지막 행에 타일이 하나면 그 타일이 전체 폭으로 늘어난다.
 */
export const toExploreGridData = (items: ExploreEntry[]): (ExploreEntry | null)[] =>
  items.length % 2 === 1 ? [...items, null] : items;

/** 빈 칸은 id 가 없다 — 위치로 키를 만든다. 시리즈 카드는 접두가 붙은 키다(explore.entry.ts) */
export const exploreGridKey = (item: ExploreEntry | null, index: number): string =>
  item ? exploreEntryKey(item) : `grid-spacer-${index}`;
