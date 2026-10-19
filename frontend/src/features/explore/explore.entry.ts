import type { ExploreEntry, ExploreLibraryState } from './explore.types';

/**
 * 섞인 목록(콘텐츠 행 + 시리즈 카드 — explore-api.md 4.1-1)을 다루는 순수 함수. 화면 훅 둘(피드·검색)이 같은 규칙을 쓴다.
 * 시리즈 카드에는 편 단위 상태가 없으므로 담기·회수 처리는 콘텐츠 행에만 닿는다
 */

/** 목록 React key — 콘텐츠 id 와 시리즈 id 가 같은 공간을 쓰지 않게 시리즈에 접두를 붙인다 */
export const exploreEntryKey = (entry: ExploreEntry): string =>
  entry.type === 'series' ? `series-${entry.series.id}` : entry.content.id;

/** 회수(403)로 로컬에서 걷어낸 행인가 — 시리즈 카드는 걷지 않는다(편 회수는 서버가 카드·시리즈 화면에 반영한다) */
export const isHiddenEntry = (
  entry: ExploreEntry,
  hiddenContentIds: ReadonlySet<string>,
): boolean => entry.type !== 'series' && hiddenContentIds.has(entry.content.id);

/** 낙관 반영 — 그 콘텐츠의 행만 담김 상태를 바꾼다. 시리즈 카드는 그대로 둔다 */
export const withEntryLibraryState = (
  entries: ExploreEntry[],
  contentId: string,
  library: ExploreLibraryState | null,
): ExploreEntry[] =>
  entries.map((entry) =>
    entry.type !== 'series' && entry.content.id === contentId ? { ...entry, library } : entry,
  );

/** 사진 미리 올리기(구간 전환) 등에 쓰는 항목의 대표 사진 — 시리즈 카드는 표지(1화 썸네일) */
export const exploreEntryThumbnail = (entry: ExploreEntry): string =>
  entry.type === 'series' ? entry.series.thumbnailUrl : entry.content.thumbnailUrl;
