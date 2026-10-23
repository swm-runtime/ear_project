import { describe, expect, it } from '@jest/globals';

import type { QueueEntry } from '../player.types';
import {
  applyKeyOrder,
  dragShiftOf,
  hoverIndexOf,
  isSameKeys,
  minDragIndexOf,
  queueRowKey,
  retainedBottomInset,
} from './queue-drag';

const entry = (contentId: string, itemId: string | null = `item-${contentId}`): QueueEntry => ({
  itemId,
  contentId,
  title: contentId,
  authorName: null,
  sourceName: null,
  thumbnailUrl: null,
  durationSec: 300,
  isCountedToday: false,
  isCompleted: false,
  topicIds: [],
});

describe('queueRowKey', () => {
  it('라이브러리 항목 id 가 있으면 그것, 없으면 콘텐츠 id 로 만든다', () => {
    expect(queueRowKey(entry('a'))).toBe('item-a');
    expect(queueRowKey(entry('a', null))).toBe('content-a');
  });
});

describe('isSameKeys', () => {
  it('같은 키를 같은 순서로 담았을 때만 참', () => {
    expect(isSameKeys(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(isSameKeys(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(isSameKeys(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('applyKeyOrder', () => {
  const a = entry('a');
  const b = entry('b');
  const c = entry('c');

  it('놓은 순서를 부모 목록보다 먼저 그린다 — 줄 객체는 부모 것', () => {
    const fresh = { ...b, title: '새 객체' };
    expect(applyKeyOrder([a, fresh, c], ['item-c', 'item-a', 'item-b'])).toEqual([c, a, fresh]);
  });

  it('이미 그 순서면 같은 배열을 돌려준다(메모가 깨지지 않게)', () => {
    const items = [a, b, c];
    expect(applyKeyOrder(items, ['item-a', 'item-b', 'item-c'])).toBe(items);
  });

  it('줄 구성이 바뀌었으면(삭제·새로 받기) null — 붙잡지 않는다', () => {
    expect(applyKeyOrder([a, b], ['item-a', 'item-b', 'item-c'])).toBeNull();
    expect(applyKeyOrder([a, b, c], ['item-a', 'item-b', 'item-x'])).toBeNull();
  });
});

describe('minDragIndexOf', () => {
  it('맨 위에 세운 지금 듣는 편이 있으면 1번 칸부터 — 그 줄 위로는 못 간다(KAN-254 원인 5)', () => {
    expect(minDragIndexOf([entry('now'), entry('a')], 'now')).toBe(1);
  });

  it('세운 줄이 없거나 맨 위가 아니면 0', () => {
    expect(minDragIndexOf([entry('a'), entry('now')], 'now')).toBe(0);
    expect(minDragIndexOf([entry('a')], null)).toBe(0);
  });
});

describe('hoverIndexOf', () => {
  it('이동량을 칸으로 반올림한다', () => {
    expect(hoverIndexOf(2, 70, 5, 0, 60)).toBe(3);
    expect(hoverIndexOf(2, -100, 5, 0, 60)).toBe(0);
  });

  it('목록 범위와 맨 위 칸을 넘지 않는다', () => {
    expect(hoverIndexOf(2, 1000, 5, 0, 60)).toBe(4);
    expect(hoverIndexOf(2, -1000, 5, 1, 60)).toBe(1);
  });
});

describe('dragShiftOf', () => {
  it('아래로 끌면 지나친 줄이 한 칸 위로 비켜 준다', () => {
    const drag = { from: 1, hover: 3 };
    expect([0, 1, 2, 3, 4].map((index) => dragShiftOf(index, drag, 60))).toEqual([
      0, 0, -60, -60, 0,
    ]);
  });

  it('위로 끌면 지나친 줄이 한 칸 아래로 비켜 준다', () => {
    const drag = { from: 3, hover: 1 };
    expect([0, 1, 2, 3, 4].map((index) => dragShiftOf(index, drag, 60))).toEqual([0, 60, 60, 0, 0]);
  });

  it('끌기가 없으면 0', () => {
    expect(dragShiftOf(2, null, 60)).toBe(0);
  });
});

describe('retainedBottomInset', () => {
  const base = { viewport: 600, contentEnd: 2000, basePadding: 16 };

  it('끝에서 멀리 있으면 원하는 여백(2단 — 안전영역만)으로 바로 줄인다', () => {
    expect(retainedBottomInset({ ...base, target: 34, offset: 300 })).toBe(34);
  });

  it('줄이면 스크롤 위치가 끝을 넘을 때는 넘지 않을 만큼만 남긴다 — 목록이 툭 내려앉지 않게', () => {
    // 1단 여백 400 으로 끝까지 내려 둔 자리(최대 2000 + 16 + 400 - 600 = 1816)에서 2단(34)으로
    const kept = retainedBottomInset({ ...base, target: 34, offset: 1816 });
    expect(kept).toBe(400);
    // 그 여백이면 콘텐츠 높이가 지금 화면 바닥을 덮는다
    expect(base.contentEnd + base.basePadding + kept).toBeGreaterThanOrEqual(1816 + base.viewport);
  });

  it('위로 스크롤해 끝에서 멀어지면 남은 몫을 마저 걷는다', () => {
    expect(retainedBottomInset({ ...base, target: 34, offset: 1500 })).toBe(84);
    expect(retainedBottomInset({ ...base, target: 34, offset: 1000 })).toBe(34);
  });

  it('늘릴 때(2단 → 1단)는 원하는 여백 그대로', () => {
    expect(retainedBottomInset({ ...base, target: 400, offset: 1816 })).toBe(400);
  });

  it('실측 전이면 원하는 여백', () => {
    expect(retainedBottomInset({ ...base, viewport: 0, target: 34, offset: 0 })).toBe(34);
  });
});
