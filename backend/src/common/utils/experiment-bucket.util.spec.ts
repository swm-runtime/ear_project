import { randomUUID } from 'node:crypto';

import {
  bucketLabel,
  experimentBucket,
  fnv1a32,
} from './experiment-bucket.util';

const USER_IDS = Array.from({ length: 10_000 }, () => randomUUID());

describe('experimentBucket — 실험 그룹 배정', () => {
  it('같은 사용자·같은 실험이면 몇 번을 불러도 같은 그룹이다', () => {
    for (const userId of USER_IDS.slice(0, 100)) {
      const first = experimentBucket(userId, 'drip_arrival_time', 2);

      for (let i = 0; i < 5; i += 1) {
        expect(experimentBucket(userId, 'drip_arrival_time', 2)).toBe(first);
      }
    }
  });

  it('고정 입력의 값이 바뀌지 않는다 — 해시를 바꾸면 배포 사이에 사용자의 그룹이 옮겨 간다', () => {
    expect(
      [1, 2, 3, 4, 5, 6].map((n) =>
        experimentBucket(
          `00000000-0000-4000-8000-00000000000${n}`,
          'drip_arrival_time',
          2,
        ),
      ),
    ).toEqual([0, 0, 0, 1, 1, 0]);
    // FNV-1a 공개 시험값 — 리텐션 변형(assignVariant)이 같은 함수를 쓴다
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
  });

  it('사용자 1만 명을 두 그룹에 거의 반반으로 나눈다(각 48~52%)', () => {
    const inA = USER_IDS.filter(
      (userId) => experimentBucket(userId, 'drip_arrival_time', 2) === 0,
    ).length;

    expect(inA / USER_IDS.length).toBeGreaterThan(0.48);
    expect(inA / USER_IDS.length).toBeLessThan(0.52);
  });

  it('세 그룹도 고르게 나눈다(각 31~36%)', () => {
    const counts = [0, 0, 0];

    for (const userId of USER_IDS) {
      counts[experimentBucket(userId, 'three_way', 3)] += 1;
    }

    for (const count of counts) {
      expect(count / USER_IDS.length).toBeGreaterThan(0.31);
      expect(count / USER_IDS.length).toBeLessThan(0.36);
    }
  });

  it('실험 키가 다르면 서로 독립이다 — 두 실험에서 같은 그룹인 비율이 약 50%(48~52%)', () => {
    const same = USER_IDS.filter(
      (userId) =>
        experimentBucket(userId, 'drip_arrival_time', 2) ===
        experimentBucket(userId, 'another_experiment', 2),
    ).length;

    expect(same / USER_IDS.length).toBeGreaterThan(0.48);
    expect(same / USER_IDS.length).toBeLessThan(0.52);
  });

  it('그룹이 1개 이하이면 늘 0이다', () => {
    expect(experimentBucket(USER_IDS[0], 'x', 1)).toBe(0);
    expect(experimentBucket(USER_IDS[0], 'x', 0)).toBe(0);
  });

  it('그룹 표기는 a·b… 다', () => {
    expect([0, 1, 2].map(bucketLabel)).toEqual(['a', 'b', 'c']);
  });
});
