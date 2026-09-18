import { describe, expect, it } from '@jest/globals';

import {
  QUEUE_ORDER_MAX_IDS,
  applyQueueOrder,
  moveInArray,
  parseQueueOrder,
  serializeQueueOrder,
} from './queue-order';

const item = (itemId: string) => ({ itemId });

describe('applyQueueOrder', () => {
  it('저장된 순서가 없으면 받아 온 순서를 그대로 돌려준다', () => {
    const items = [item('a'), item('b')];
    expect(applyQueueOrder(items, [])).toBe(items);
  });

  it('저장된 순서대로 다시 늘어놓는다', () => {
    const result = applyQueueOrder([item('a'), item('b'), item('c')], ['c', 'a', 'b']);
    expect(result.map((i) => i.itemId)).toEqual(['c', 'a', 'b']);
  });

  it('저장된 순서에 없는 새 항목은 서버 순서 그대로 맨 위에 둔다', () => {
    const result = applyQueueOrder([item('new1'), item('a'), item('new2'), item('b')], ['b', 'a']);
    expect(result.map((i) => i.itemId)).toEqual(['new1', 'new2', 'b', 'a']);
  });

  it('목록에 없는 저장 id 는 무시한다', () => {
    const result = applyQueueOrder([item('a'), item('b')], ['gone', 'b', 'a']);
    expect(result.map((i) => i.itemId)).toEqual(['b', 'a']);
  });
});

describe('moveInArray', () => {
  it('아래로 옮긴다', () => {
    expect(moveInArray(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('위로 옮긴다', () => {
    expect(moveInArray(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('같은 자리·범위 밖이면 내용이 같은 새 배열을 돌려준다', () => {
    const list = ['a', 'b'];
    expect(moveInArray(list, 1, 1)).toEqual(list);
    expect(moveInArray(list, 0, 5)).toEqual(list);
    expect(moveInArray(list, -1, 0)).toEqual(list);
  });
});

describe('저장 직렬화', () => {
  it('직렬화한 값을 그대로 복원한다', () => {
    expect(parseQueueOrder(serializeQueueOrder(['a', 'b']))).toEqual(['a', 'b']);
  });

  it('상한을 넘는 id 는 뒤에서 버린다', () => {
    const ids = Array.from({ length: QUEUE_ORDER_MAX_IDS + 5 }, (_, i) => `id${i}`);
    expect(parseQueueOrder(serializeQueueOrder(ids))).toHaveLength(QUEUE_ORDER_MAX_IDS);
  });

  it('값이 없거나 깨졌으면 빈 순서로 본다', () => {
    expect(parseQueueOrder(null)).toEqual([]);
    expect(parseQueueOrder('not json')).toEqual([]);
    expect(parseQueueOrder('{"a":1}')).toEqual([]);
    expect(parseQueueOrder('["a", 3, null, "b"]')).toEqual(['a', 'b']);
  });
});
