import { describe, expect, it } from '@jest/globals';

import { marqueeCopyCount, marqueeRowCount, toTopicRows } from './topic-rows';

describe('marqueeRowCount — 줄 수는 주제 수를 따른다', () => {
  it('1~3개는 1줄이다', () => {
    expect(marqueeRowCount(1)).toBe(1);
    expect(marqueeRowCount(3)).toBe(1);
  });

  it('4~6개는 2줄, 7~9개는 3줄이다', () => {
    expect(marqueeRowCount(4)).toBe(2);
    expect(marqueeRowCount(7)).toBe(3);
  });

  it('10개부터는 4줄 상한에 머문다', () => {
    expect(marqueeRowCount(10)).toBe(4);
    expect(marqueeRowCount(36)).toBe(4);
  });
});

describe('toTopicRows — 라운드로빈 분배', () => {
  it('7개는 3줄에 3·2·2로 나뉜다(줄당 1개인 줄이 없다)', () => {
    const rows = toTopicRows([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.map((r) => r.length)).toEqual([3, 2, 2]);
    expect(rows[0]).toEqual([1, 4, 7]);
  });

  it('1개는 한 줄에 그대로다', () => {
    expect(toTopicRows(['a'])).toEqual([['a']]);
  });

  it('36개는 4줄에 9개씩이다(현행 유지)', () => {
    const rows = toTopicRows(Array.from({ length: 36 }, (_, i) => i));
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.length === 9)).toBe(true);
  });

  it('빈 목록은 빈 배열이다', () => {
    expect(toTopicRows([])).toEqual([]);
  });
});

describe('marqueeCopyCount — 뷰포트를 덮고도 한 벌이 남는다', () => {
  it('한 벌이 뷰포트보다 넓으면 3벌이다(현행)', () => {
    expect(marqueeCopyCount(390, 1476)).toBe(3);
  });

  it('한 벌이 164px(알약 1개)이면 폰 폭 390에서 5벌이다', () => {
    // ceil(390/164)=3 → +2 = 5. 되감기 구간(0.5~1.5벌) 어디서든 5벌이면 뷰포트(2.4벌)가 덮인다
    expect(marqueeCopyCount(390, 164)).toBe(5);
  });

  it('측정 전(0)에는 3벌로 시작한다', () => {
    expect(marqueeCopyCount(0, 164)).toBe(3);
    expect(marqueeCopyCount(390, 0)).toBe(3);
  });
});
