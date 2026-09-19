import { describe, expect, it } from '@jest/globals';

import {
  QUEUE_ORDER_MAX_IDS,
  moveInArray,
  parseQueueOrder,
  toQueueOrderPayload,
} from './queue-order';

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

describe('toQueueOrderPayload', () => {
  it('중복을 걷고 순서를 지킨다', () => {
    expect(toQueueOrderPayload(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('상한을 넘는 id 는 뒤에서 버린다', () => {
    const ids = Array.from({ length: QUEUE_ORDER_MAX_IDS + 5 }, (_, i) => `id-${i}`);
    expect(toQueueOrderPayload(ids)).toHaveLength(QUEUE_ORDER_MAX_IDS);
  });
});

describe('parseQueueOrder', () => {
  it('기기에 저장해 둔 값을 복원한다', () => {
    expect(parseQueueOrder(JSON.stringify(['a', 'b']))).toEqual(['a', 'b']);
  });

  it('값이 없거나 깨졌으면 빈 순서로 본다', () => {
    expect(parseQueueOrder(null)).toEqual([]);
    expect(parseQueueOrder('not json')).toEqual([]);
    expect(parseQueueOrder('{"a":1}')).toEqual([]);
    expect(parseQueueOrder('["a", 3, null, "b"]')).toEqual(['a', 'b']);
  });
});
