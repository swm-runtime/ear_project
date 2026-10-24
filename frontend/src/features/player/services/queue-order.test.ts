import { describe, expect, it } from '@jest/globals';

import {
  QUEUE_ORDER_MAX_IDS,
  moveInArray,
  parseQueueOrder,
  reorderSubset,
  toQueueOrderPayload,
} from './queue-order';

describe('reorderSubset', () => {
  const keyOf = (item: string) => item;

  it('보인 줄의 새 순서를 전체 목록에 입힌다', () => {
    expect(reorderSubset(['a', 'b', 'c', 'd'], keyOf, ['c', 'a', 'b', 'd'])).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);
  });

  it('숨긴 줄(삭제 대기)은 제자리에 두고 보인 줄의 자리에만 채운다', () => {
    // b 는 패널에 없다(숨김) — a 와 d 만 자리를 바꾼다
    expect(reorderSubset(['a', 'b', 'c', 'd'], keyOf, ['d', 'c', 'a'])).toEqual([
      'd',
      'b',
      'c',
      'a',
    ]);
  });

  it('전체에 없는 키(맨 위에 세운 지금 듣는 편)는 건너뛴다', () => {
    expect(reorderSubset(['a', 'b', 'c'], keyOf, ['pinned', 'c', 'a', 'b'])).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('순서가 그대로면 null — 맨 위에 세운 줄만 옮긴 경우 포함', () => {
    expect(reorderSubset(['a', 'b', 'c'], keyOf, ['a', 'b', 'c'])).toBeNull();
    expect(reorderSubset(['a', 'b', 'c'], keyOf, ['a', 'pinned', 'b', 'c'])).toBeNull();
  });

  it('앞 끌기가 렌더에 반영되기 전에 다음 끌기를 확정해도 두 번 모두 남는다(KAN-255)', () => {
    // 첫 끌기 a → 끝, 캐시는 이미 [b, c, a]. 패널은 같은 순서에서 c 를 맨 위로 옮겼다
    const afterFirst = reorderSubset(['a', 'b', 'c'], keyOf, ['b', 'c', 'a']);
    expect(afterFirst).toEqual(['b', 'c', 'a']);
    expect(reorderSubset(afterFirst ?? [], keyOf, ['c', 'b', 'a'])).toEqual(['c', 'b', 'a']);
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
