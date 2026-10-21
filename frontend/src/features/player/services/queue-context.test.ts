import { describe, expect, it } from '@jest/globals';

import type { PlayQueueContext, QueueEntry } from '../player.types';
import {
  appendToSnapshot,
  withCurrentFirst,
  withoutSnapshotItem,
  withSnapshotItemId,
} from './queue-context';

const entry = (contentId: string, itemId: string | null = null): QueueEntry => ({
  itemId,
  contentId,
  title: contentId,
  authorName: null,
  sourceName: null,
  thumbnailUrl: null,
  durationSec: 600,
  isCountedToday: false,
  isCompleted: false,
  topicIds: [],
});

const exploreContext = (ids: string[]): PlayQueueContext => ({
  kind: 'explore',
  source: { type: 'search', query: '커리어' },
  items: ids.map((id) => entry(id)),
});

describe('재생 목록 맥락(KAN-241) — 순수 계산', () => {
  it('지금 듣는 편이 스냅샷에 없으면 맨 위에 세운다', () => {
    const result = withCurrentFirst([entry('a'), entry('b')], entry('x'));
    expect(result.map((item) => item.contentId)).toEqual(['x', 'a', 'b']);
  });

  it('지금 듣는 편이 스냅샷에 있으면 순서를 바꾸지 않는다', () => {
    const items = [entry('a'), entry('b')];
    expect(withCurrentFirst(items, entry('b'))).toBe(items);
  });

  it('추천 줄을 틀면 지금 듣는 편 바로 뒤에 더해지고 맥락은 그대로다', () => {
    const next = appendToSnapshot(exploreContext(['a', 'b', 'c']), entry('r'), 'b');
    expect(next.kind).toBe('explore');
    if (next.kind !== 'explore') return;
    expect(next.items.map((item) => item.contentId)).toEqual(['a', 'b', 'r', 'c']);
    expect(next.source).toEqual({ type: 'search', query: '커리어' });
  });

  it('이미 스냅샷에 있는 편은 다시 더하지 않고, 라이브러리 맥락은 바뀌지 않는다', () => {
    const context = exploreContext(['a', 'b']);
    expect(appendToSnapshot(context, entry('a'), 'b')).toBe(context);
    const library: PlayQueueContext = { kind: 'library' };
    expect(appendToSnapshot(library, entry('a'), null)).toBe(library);
  });

  it('왼쪽 스와이프는 스냅샷에서 그 줄만 뺀다 — 라이브러리 맥락·없는 편은 그대로', () => {
    const context = exploreContext(['a', 'b', 'c']);
    const removed = withoutSnapshotItem(context, 'b');
    if (removed.kind !== 'explore') throw new Error('explore 맥락이어야 한다');
    expect(removed.items.map((item) => item.contentId)).toEqual(['a', 'c']);
    expect(withoutSnapshotItem(context, 'zzz')).toBe(context);
    const library: PlayQueueContext = { kind: 'library' };
    expect(withoutSnapshotItem(library, 'a')).toBe(library);
  });

  it('담기 결과는 그 줄의 itemId 만 채운다 — 실패 복구는 null 로 되돌린다', () => {
    const saved = withSnapshotItemId(exploreContext(['a', 'b']), 'b', 'item-b');
    if (saved.kind !== 'explore') throw new Error('explore 맥락이어야 한다');
    expect(saved.items.map((item) => item.itemId)).toEqual([null, 'item-b']);
    const reverted = withSnapshotItemId(saved, 'b', null);
    if (reverted.kind !== 'explore') throw new Error('explore 맥락이어야 한다');
    expect(reverted.items[1].itemId).toBeNull();
  });
});
