import {
  ListAccumulator,
  cosine,
  jaccard,
  randomRankingMetrics,
  rankingMetrics,
} from './eval-metrics';

const NOW = new Date('2026-09-30T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('rankingMetrics', () => {
  it('순위 목록에서 Hit@K 와 MRR 을 낸다 — 후보에 없던 정답(null)은 전부 빗나간 것으로 센다', () => {
    const metrics = rankingMetrics([1, 3, null, 12], [2, 5, 10]);

    expect(metrics.hitAt).toEqual({ '2': 0.25, '5': 0.5, '10': 0.5 });
    expect(metrics.mrr).toBeCloseTo((1 + 1 / 3 + 0 + 1 / 12) / 4, 6);
  });

  it('무작위 기대값 — 후보 n 편이면 Hit@K 는 min(K, n)/n, MRR 은 H_n/n', () => {
    const metrics = randomRankingMetrics([4, null], [2, 10]);

    // n=4: hit@2 = 0.5, hit@10 = 1, mrr = (1+1/2+1/3+1/4)/4 ; null 은 0
    expect(metrics.hitAt['2']).toBeCloseTo(0.25, 6);
    expect(metrics.hitAt['10']).toBeCloseTo(0.5, 6);
    expect(metrics.mrr).toBeCloseTo((1 + 1 / 2 + 1 / 3 + 1 / 4) / 4 / 2, 6);
  });
});

describe('cosine · jaccard', () => {
  it('같은 방향은 1, 직교는 0', () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1, 6);
    expect(cosine([1, 0], [0, 3])).toBeCloseTo(0, 6);
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 6);
  });
});

describe('ListAccumulator', () => {
  it('고갈률·주제 다양성·거리·신규·미노출·커버리지·겹침을 정의대로 낸다', () => {
    const accumulator = new ListAccumulator();
    const fresh = new Date(NOW.getTime() - 3 * DAY);
    const old = new Date(NOW.getTime() - 60 * DAY);

    accumulator.add({
      userKey: 'a',
      now: NOW,
      regularTarget: 2,
      regularPicks: 2,
      picks: [
        {
          contentId: 'x',
          topicIds: ['t1'],
          embedding: [1, 0],
          publishedAt: fresh,
          exposureCount: 0,
        },
        {
          contentId: 'y',
          topicIds: ['t1'],
          embedding: [0, 1],
          publishedAt: old,
          exposureCount: 3,
        },
      ],
      autoExpandAction: 'add',
    });
    accumulator.add({
      userKey: 'b',
      now: NOW,
      regularTarget: 2,
      regularPicks: 1,
      picks: [
        {
          contentId: 'x',
          topicIds: ['t2'],
          embedding: null,
          publishedAt: fresh,
          exposureCount: 0,
        },
      ],
      autoExpandAction: null,
    });

    const metrics = accumulator.finish(10);

    expect(metrics.plans).toBe(2);
    expect(metrics.exhaustionRate).toBe(0.5);
    // a: 주제 1개/2편 = 0.5, b: 1/1 = 1 → 평균 0.75
    expect(metrics.topicDiversity).toBeCloseTo(0.75, 6);
    // 임베딩 쌍은 (x, y) 하나 — 직교라 거리 1
    expect(metrics.intraListDistance).toBeCloseTo(1, 6);
    expect(metrics.freshShare).toBeCloseTo(2 / 3, 6);
    expect(metrics.zeroExposureShare).toBeCloseTo(2 / 3, 6);
    expect(metrics.catalogCoverage).toBeCloseTo(0.2, 6);
    // a={x,y}, b={x} → 자카드 1/2
    expect(metrics.userOverlap).toBeCloseTo(0.5, 6);
    expect(metrics.autoExpand).toEqual({ add: 1 });
  });
});
