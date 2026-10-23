import { describe, expect, it } from '@jest/globals';

import type { PlayQueueContext, QueueEntry } from '../player.types';
import {
  appendToSnapshot,
  nextAutoplayEntry,
  withCurrentFirst,
  withoutSnapshotItem,
  withPagesItemId,
  withSnapshotItemId,
  withSnapshotOrder,
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

  it('손잡이로 옮긴 순서가 스냅샷이 된다 — 맨 위에 세운 지금 듣는 편도 함께 들어간다', () => {
    const context = exploreContext(['a', 'b']);
    const moved = withSnapshotOrder(context, [entry('a'), entry('b'), entry('x')]);
    if (moved.kind !== 'explore') throw new Error('explore 맥락이어야 한다');
    expect(moved.items.map((item) => item.contentId)).toEqual(['a', 'b', 'x']);
    expect(moved.source).toEqual({ type: 'search', query: '커리어' });
  });

  it('스냅샷에 있는 편은 스냅샷의 줄 객체를 쓴다 — 그사이 담긴 itemId 를 잃지 않는다', () => {
    const saved = withSnapshotItemId(exploreContext(['a', 'b']), 'b', 'item-b');
    const moved = withSnapshotOrder(saved, [entry('b'), entry('a')]);
    if (moved.kind !== 'explore') throw new Error('explore 맥락이어야 한다');
    expect(moved.items.map((item) => item.itemId)).toEqual(['item-b', null]);
  });

  it('순서가 그대로면 맥락을 그대로 두고, 라이브러리 맥락은 건드리지 않는다', () => {
    const context = exploreContext(['a', 'b']);
    expect(withSnapshotOrder(context, [entry('a'), entry('b')])).toBe(context);
    const library: PlayQueueContext = { kind: 'library' };
    expect(withSnapshotOrder(library, [entry('b'), entry('a')])).toBe(library);
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

describe('자동 재생(연속 재생 — player.md 4.2-4) — 다음 편 고르기', () => {
  it('지금 듣는 편 바로 뒤의 편을 고른다', () => {
    expect(nextAutoplayEntry([entry('a'), entry('b'), entry('c')], 'b')?.contentId).toBe('c');
  });

  it('다 들은 편은 건너뛴다', () => {
    const done = { ...entry('b'), isCompleted: true };
    expect(nextAutoplayEntry([entry('a'), done, entry('c')], 'a')?.contentId).toBe('c');
  });

  it('뒤에 남은 안 들은 편이 없으면 멈춘다(null)', () => {
    const done = { ...entry('b'), isCompleted: true };
    expect(nextAutoplayEntry([entry('a'), done], 'a')).toBeNull();
    expect(nextAutoplayEntry([entry('a')], 'a')).toBeNull();
  });

  it('지금 듣는 편이 목록에 없으면 멈춘다(null) — 엉뚱한 편을 틀지 않는다', () => {
    expect(nextAutoplayEntry([entry('a'), entry('b')], 'x')).toBeNull();
  });
});

describe('추천 블록 담기 반영(KAN-259) — 장들의 itemId', () => {
  it('그 편이 든 장만 새로 만들어 itemId 를 채운다', () => {
    const untouched = [entry('a'), entry('b')];
    const pages = [untouched, [entry('c'), entry('d')]];
    const result = withPagesItemId(pages, 'c', 'item-c');
    expect(result[0]).toBe(untouched);
    expect(result[1].map((item) => item.itemId)).toEqual(['item-c', null]);
  });

  it('실패 복구는 null 로 되돌린다', () => {
    const pages = [[entry('a', 'optimistic-a')]];
    expect(withPagesItemId(pages, 'a', null)[0][0].itemId).toBeNull();
  });

  it('그 편이 없거나 값이 같으면 같은 참조를 돌려준다', () => {
    const pages = [[entry('a', 'item-a')]];
    expect(withPagesItemId(pages, 'z', 'item-z')).toBe(pages);
    expect(withPagesItemId(pages, 'a', 'item-a')).toBe(pages);
  });
});
