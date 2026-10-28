import { InsightsCompletionContentRow } from '../admin.types';
import {
  estimatePriorStrength,
  fitLengthTrend,
  summarizeCompletionByLength,
} from './admin-insights-completion.calc';

const row = (
  minutes: number,
  starters: number,
  completers: number,
): InsightsCompletionContentRow => ({
  contentId: `c-${minutes}-${starters}-${completers}`,
  title: `${minutes}분`,
  durationSec: minutes * 60,
  starters,
  completers,
});

const options = { slopeStepMin: 5, minContents: 5 };

describe('길이별 완청률 계산', () => {
  describe('fitLengthTrend — 로지스틱 회귀 추세', () => {
    it('길수록 완청이 뚜렷하게 줄면 오즈비 구간이 1 아래라 down 이다', () => {
      // given — 10분 40% → 25분 10%, 편마다 100명
      const rows = [
        row(10, 100, 40),
        row(13, 100, 33),
        row(16, 100, 26),
        row(19, 100, 20),
        row(22, 100, 14),
        row(25, 100, 10),
      ];

      // when
      const trend = fitLengthTrend(rows, options);

      // then
      expect(trend).not.toBeNull();
      expect(trend!.direction).toBe('down');
      expect(trend!.oddsRatioPerStep).toBeLessThan(1);
      expect(trend!.oddsRatioHigh).toBeLessThan(1);
      expect(trend!.curve[0].minute).toBe(10);
      expect(trend!.curve.at(-1)!.minute).toBe(25);
      expect(trend!.curve[0].rate).toBeGreaterThan(trend!.curve.at(-1)!.rate);
      for (const p of trend!.curve) {
        expect(p.low).toBeLessThanOrEqual(p.rate);
        expect(p.high).toBeGreaterThanOrEqual(p.rate);
      }
    });

    it('한두 명짜리 편의 0%·100% 는 추세를 거의 움직이지 못한다 — 많이 시작한 편이 무게를 갖는다', () => {
      // given — 큰 편들은 길이와 무관하게 30%, 11분짜리 2명 0% 와 24분짜리 1명 100% 를 섞는다
      const big = [10, 14, 18, 22, 26].map((m) => row(m, 200, 60));
      const noisy = [...big, row(11, 2, 0), row(24, 1, 1)];

      // when
      const trend = fitLengthTrend(noisy, options);

      // then
      expect(trend!.direction).toBe('flat');
      expect(trend!.oddsRatioPerStep).toBeGreaterThan(0.9);
      expect(trend!.oddsRatioPerStep).toBeLessThan(1.1);
    });

    it('편끼리 흔들림이 크면(과분산) 구간을 넓혀, 적은 차이로 down 을 단정하지 않는다', () => {
      // given — 길이 경향은 약하고 편마다 들쭉날쭉
      const rows = [
        row(10, 100, 50),
        row(12, 100, 10),
        row(15, 100, 45),
        row(18, 100, 8),
        row(21, 100, 40),
        row(24, 100, 12),
      ];

      // when
      const trend = fitLengthTrend(rows, options);

      // then
      expect(trend!.dispersion).toBeGreaterThan(1);
      expect(trend!.direction).toBe('flat');
    });

    it('편이 적거나, 길이가 다 같거나, 전원 완청·미완청이면 null 이다', () => {
      expect(fitLengthTrend([row(10, 10, 3)], options)).toBeNull();
      expect(
        fitLengthTrend(
          [10, 10, 10, 10, 10].map((m) => row(m, 10, 3)),
          options,
        ),
      ).toBeNull();
      expect(
        fitLengthTrend(
          [10, 12, 14, 16, 18].map((m) => row(m, 10, 0)),
          options,
        ),
      ).toBeNull();
      expect(
        fitLengthTrend(
          [10, 12, 14, 16, 18].map((m) => row(m, 10, 10)),
          options,
        ),
      ).toBeNull();
    });
  });

  describe('경험적 베이즈 축소', () => {
    it('시작한 사람이 적은 편은 전체 평균 쪽으로, 많은 편은 거의 그대로다', () => {
      // given
      const rows = [
        row(10, 400, 160),
        row(15, 400, 100),
        row(20, 400, 60),
        row(11, 2, 0),
      ];

      // when
      const v = summarizeCompletionByLength(rows, new Date(0), options);

      // then
      const tiny = v.contents.find((c) => c.starters === 2)!;
      const big = v.contents.find((c) => c.durationSec === 600)!;
      expect(tiny.rawRate).toBe(0);
      expect(tiny.shrunkRate).toBeGreaterThan(0.15);
      expect(Math.abs(big.shrunkRate - big.rawRate)).toBeLessThan(0.02);
      expect(v.overallRate).toBeCloseTo(320 / 1202);
      expect(v.starters).toBe(1202);
    });

    it('편끼리 차이가 다 우연 수준이면 축소 강도는 상한, 크면 작다', () => {
      const same = [row(10, 50, 15), row(15, 50, 15), row(20, 50, 15)];
      expect(estimatePriorStrength(same, 0.3)).toBe(500);
      const spread = [row(10, 200, 180), row(15, 200, 20), row(20, 200, 100)];
      expect(estimatePriorStrength(spread, 0.5)).toBeLessThan(10);
    });

    it('시작한 사람이 없으면 비율·축소 강도·추세는 null 이다', () => {
      const v = summarizeCompletionByLength([], new Date(0), options);
      expect(v.overallRate).toBeNull();
      expect(v.priorStrength).toBeNull();
      expect(v.trend).toBeNull();
      expect(v.contents).toEqual([]);
    });
  });
});
