import type { ExploreItem } from './explore.types';

/**
 * 두 칸 썸네일 격자용 데이터(2026-09-18) — 홀수면 빈 칸(null)을 하나 채운다.
 * `numColumns={2}`의 마지막 행에 타일이 하나면 그 타일이 전체 폭으로 늘어난다.
 */
export const toExploreGridData = (items: ExploreItem[]): (ExploreItem | null)[] =>
  items.length % 2 === 1 ? [...items, null] : items;

/** 빈 칸은 content id 가 없다 — 위치로 키를 만든다 */
export const exploreGridKey = (item: ExploreItem | null, index: number): string =>
  item?.content.id ?? `grid-spacer-${index}`;
