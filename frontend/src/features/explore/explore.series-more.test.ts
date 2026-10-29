import { describe, expect, it } from '@jest/globals';

import { pickOtherSeries, withoutSeriesEpisodes } from './explore.series-more';
import type { ExploreEntry, ExploreItem, ExploreSeriesItem } from './explore.types';

const item = (id: string, seriesId: string | null = null): ExploreItem => ({
  type: 'content',
  content: {
    id,
    title: `제목 ${id}`,
    authorName: '',
    sourceName: '폴인',
    sourceUrl: null,
    durationSec: 600,
    thumbnailUrl: 'https://img',
    contentVersion: 1,
    topicIds: ['t1'],
    tags: [],
    language: null,
    isLocked: false,
    series: seriesId ? { id: seriesId, title: '시리즈', episodeNo: 1, totalEpisodes: 3 } : null,
  },
  library: null,
  isCountedToday: false,
  isCompleted: false,
});

const card = (id: string): ExploreSeriesItem => ({
  type: 'series',
  series: {
    id,
    title: `시리즈 ${id}`,
    description: '',
    totalEpisodes: 3,
    episodeCount: 3,
    status: 'completed',
    thumbnailUrl: 'https://img',
    topicIds: ['t1'],
  },
});

describe('시리즈 화면 "다른 시리즈 더보기"', () => {
  it('시리즈 카드만, 넘겨받은 목록 순서대로 모은다', () => {
    const lists: ExploreEntry[][] = [[item('a'), card('s2'), item('b'), card('s3')], [card('s4')]];
    expect(pickOtherSeries('s1', lists).map((s) => s.id)).toEqual(['s2', 's3', 's4']);
  });

  it('지금 보는 시리즈와 이미 모은 시리즈는 건너뛴다', () => {
    const lists: ExploreEntry[][] = [
      [card('s1'), card('s2')],
      [card('s2'), card('s3')],
    ];
    expect(pickOtherSeries('s1', lists).map((s) => s.id)).toEqual(['s2', 's3']);
  });

  it('상한을 넘지 않는다', () => {
    const lists: ExploreEntry[][] = [[card('s2'), card('s3'), card('s4')]];
    expect(pickOtherSeries('s1', lists, 2)).toHaveLength(2);
  });
});

describe('시리즈 화면 "좋아할 만한 다른 항목"', () => {
  it('이 시리즈의 편은 뺀다 — 다른 시리즈 편·단일 콘텐츠는 남긴다', () => {
    const items = [item('a', 's1'), item('b', 's2'), item('c')];
    expect(withoutSeriesEpisodes('s1', items).map((i) => i.content.id)).toEqual(['b', 'c']);
  });
});
