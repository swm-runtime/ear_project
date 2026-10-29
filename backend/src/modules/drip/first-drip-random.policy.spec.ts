import { pickRandomFirstDrip, shuffle } from './first-drip-random.policy';

/** 정해진 수열을 차례로 돌려주는 난수 — 결과를 손으로 따라갈 수 있게 */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('first-drip-random.policy', () => {
  describe('shuffle', () => {
    it('원본을 바꾸지 않고 같은 원소를 돌려준다', () => {
      const items = ['a', 'b', 'c', 'd'];

      const result = shuffle(items, sequence([0.1, 0.9, 0.5]));

      expect(items).toEqual(['a', 'b', 'c', 'd']);
      expect([...result].sort()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('같은 난수면 같은 순서다', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];

      expect(shuffle(items, sequence([0.3, 0.7]))).toEqual(
        shuffle(items, sequence([0.3, 0.7])),
      );
    });
  });

  describe('pickRandomFirstDrip', () => {
    const candidates = [
      { contentId: 'a1', topicIds: ['A'] },
      { contentId: 'a2', topicIds: ['A'] },
      { contentId: 'a3', topicIds: ['A'] },
      { contentId: 'b1', topicIds: ['B'] },
    ];

    it('편수만큼 겹치지 않게 고른다', () => {
      const picked = pickRandomFirstDrip(
        candidates,
        ['A'],
        2,
        sequence([0.42, 0.13, 0.77]),
      );

      expect(picked).toHaveLength(2);
      expect(new Set(picked).size).toBe(2);
    });

    it('주제가 둘이면 두 주제에서 한 편씩 고른다', () => {
      for (const start of [0, 0.25, 0.5, 0.75, 0.99]) {
        const picked = pickRandomFirstDrip(
          candidates,
          ['A', 'B'],
          2,
          sequence([start, 0.6, 0.2, 0.9]),
        );

        expect(picked).toContain('b1');
        expect(picked.some((id) => id.startsWith('a'))).toBe(true);
      }
    });

    it('한 주제 후보가 바닥나면 다른 주제에서 마저 채운다', () => {
      const picked = pickRandomFirstDrip(
        candidates,
        ['A', 'B'],
        3,
        sequence([0.5]),
      );

      expect(picked).toHaveLength(3);
      expect(picked).toContain('b1');
    });

    it('주제 연결이 없는 후보도 순환 뒤 나머지로 채운다(방어)', () => {
      const picked = pickRandomFirstDrip(
        [{ contentId: 'x', topicIds: [] }],
        ['A'],
        2,
        sequence([0.5]),
      );

      expect(picked).toEqual(['x']);
    });

    it('후보가 모자라면 있는 만큼만 돌려준다 — 모자란 몫은 호출자의 대체 편성 몫이다', () => {
      expect(
        pickRandomFirstDrip(candidates, ['B'], 5, sequence([0.5])),
      ).toHaveLength(4);
      expect(pickRandomFirstDrip([], ['A'], 2, sequence([0.5]))).toEqual([]);
      expect(
        pickRandomFirstDrip(candidates, ['A'], 0, sequence([0.5])),
      ).toEqual([]);
    });

    it('한 주제 안에서는 고르게 퍼진다 — 난수를 바꾸면 모든 후보가 한 번 이상 뽑힌다', () => {
      const pool = Array.from({ length: 10 }, (_, i) => ({
        contentId: `c${i}`,
        topicIds: ['A'],
      }));
      const counts = new Map<string, number>();

      for (let seed = 1; seed <= 200; seed++) {
        const random = sequence([
          (seed * 0.6180339887) % 1,
          (seed * 0.7548776662) % 1,
          (seed * 0.5698402909) % 1,
        ]);
        for (const id of pickRandomFirstDrip(pool, ['A'], 2, random)) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }

      expect(counts.size).toBe(10);
    });
  });
});
