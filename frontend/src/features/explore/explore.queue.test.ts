import { describe, expect, it } from '@jest/globals';

import { toQueueEntry, toQueueSnapshot } from './explore.queue';
import type { ExploreEntry, ExploreItem } from './explore.types';

const item = (id: string, library: ExploreItem['library'] = null): ExploreItem => ({
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
    series: null,
  },
  library,
  isCountedToday: false,
  isCompleted: library?.status === 'completed',
});

describe('탐색 목록 → 재생 목록 스냅샷(KAN-241)', () => {
  it('담기지 않은 편은 itemId 가 null — 패널이 담기 버튼을 붙이는 근거다', () => {
    const entry = toQueueEntry(item('a'));
    expect(entry.itemId).toBeNull();
    expect(entry.authorName).toBeNull();
    expect(entry.isCompleted).toBe(false);
  });

  it('담긴 편은 라이브러리 항목 id·완청 여부를 그대로 든다', () => {
    const entry = toQueueEntry(item('a', { itemId: 'li-1', source: 'save', status: 'completed' }));
    expect(entry.itemId).toBe('li-1');
    expect(entry.isCompleted).toBe(true);
  });

  it('시리즈 카드는 편이 아니라 스냅샷에서 뺀다', () => {
    const entries: ExploreEntry[] = [
      item('a'),
      {
        type: 'series',
        series: {
          id: 's',
          title: 'CS',
          description: '',
          totalEpisodes: 3,
          episodeCount: 3,
          status: 'ongoing',
          thumbnailUrl: '',
          topicIds: [],
        },
      },
      item('b'),
    ];
    const context = toQueueSnapshot(entries, { type: 'search', query: '커리어' });
    expect(context.kind).toBe('explore');
    if (context.kind !== 'explore') return;
    expect(context.items.map((entry) => entry.contentId)).toEqual(['a', 'b']);
    expect(context.source).toEqual({ type: 'search', query: '커리어' });
  });
});
