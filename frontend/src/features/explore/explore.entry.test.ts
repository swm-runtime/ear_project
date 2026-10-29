import { describe, expect, it } from '@jest/globals';

import { exploreEntryKey, isHiddenEntry, withEntryLibraryState } from './explore.entry';
import type { ExploreEntry, ExploreItem, ExploreSeriesItem } from './explore.types';

const contentItem = (id: string): ExploreItem => ({
  type: 'content',
  content: {
    id,
    title: id,
    authorName: '',
    sourceName: '',
    sourceUrl: null,
    durationSec: 600,
    thumbnailUrl: '',
    contentVersion: 1,
    topicIds: [],
    tags: [],
    language: null,
    isLocked: false,
    series: null,
  },
  library: null,
  isCountedToday: false,
  isCompleted: false,
});

const seriesItem = (id: string): ExploreSeriesItem => ({
  type: 'series',
  series: {
    id,
    title: id,
    description: '',
    totalEpisodes: 3,
    episodeCount: 3,
    status: 'completed',
    thumbnailUrl: '',
    topicIds: [],
  },
});

describe('explore.entry — 섞인 목록(explore-api.md 4.1-1)', () => {
  it('시리즈 카드의 키는 콘텐츠 id 와 겹치지 않게 접두가 붙는다', () => {
    expect(exploreEntryKey(contentItem('x'))).toBe('x');
    expect(exploreEntryKey(seriesItem('x'))).toBe('series-x');
  });

  it('회수로 걷어낸 id 는 콘텐츠 행만 가리고 시리즈 카드는 남긴다', () => {
    const hidden = new Set(['x']);

    expect(isHiddenEntry(contentItem('x'), hidden)).toBe(true);
    expect(isHiddenEntry(seriesItem('x'), hidden)).toBe(false);
  });

  it('담김 낙관 반영은 그 콘텐츠 행만 바꾸고 시리즈 카드는 그대로 둔다', () => {
    // given
    const entries: ExploreEntry[] = [contentItem('a'), seriesItem('a'), contentItem('b')];
    const library = { itemId: 'i', source: 'save' as const, status: 'unplayed' as const };

    // when
    const next = withEntryLibraryState(entries, 'a', library);

    // then
    expect((next[0] as ExploreItem).library).toEqual(library);
    expect(next[1]).toBe(entries[1]);
    expect(next[2]).toBe(entries[2]);
  });
});
