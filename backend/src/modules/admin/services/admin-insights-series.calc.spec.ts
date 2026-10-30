import { InsightsSeriesEpisodeRow } from '../admin.types';
import {
  groupSeriesEpisodes,
  toSeriesEpisode,
} from './admin-insights-series.calc';

const row = (
  seriesId: string,
  episodeNo: number,
  counts: Partial<InsightsSeriesEpisodeRow> = {},
): InsightsSeriesEpisodeRow => ({
  seriesId,
  seriesTitle: `시리즈 ${seriesId}`,
  totalEpisodes: 3,
  episodeNo,
  contentId: `${seriesId}-${episodeNo}`,
  title: `${episodeNo}화`,
  durationSec: 600,
  market: 'kr',
  status: 'published',
  nextEpisodeNo: null,
  starters: 0,
  completers: 0,
  nextStartedOfStarters: 0,
  nextStartedOfCompleters: 0,
  ...counts,
});

describe('시리즈 편별 완청·이탈 계산', () => {
  describe('toSeriesEpisode', () => {
    it('완청률은 완청/시작, 다음 편 진행률은 시작자·완청자 각각을 분모로 한다', () => {
      // given — 10명 시작, 6명 완청, 시작자 중 5명·완청자 중 4명이 2화로
      const ep = row('s', 1, {
        nextEpisodeNo: 2,
        starters: 10,
        completers: 6,
        nextStartedOfStarters: 5,
        nextStartedOfCompleters: 4,
      });

      // when
      const result = toSeriesEpisode(ep);

      // then
      expect(result.completionRate).toBeCloseTo(0.6);
      expect(result.nextRateOfStarters).toBeCloseTo(0.5);
      expect(result.nextRateOfCompleters).toBeCloseTo(4 / 6);
    });

    it('마지막 편은 진행률이 null 이고, 시작자·완청자가 0이면 비율은 0이 아니라 null 이다', () => {
      // given
      const last = row('s', 3, { starters: 4, completers: 2 });
      const empty = row('s', 1, { nextEpisodeNo: 2 });

      // when
      const lastResult = toSeriesEpisode(last);
      const emptyResult = toSeriesEpisode(empty);

      // then
      expect(lastResult.completionRate).toBeCloseTo(0.5);
      expect(lastResult.nextRateOfStarters).toBeNull();
      expect(lastResult.nextRateOfCompleters).toBeNull();
      expect(emptyResult.completionRate).toBeNull();
      expect(emptyResult.nextRateOfStarters).toBeNull();
      expect(emptyResult.nextRateOfCompleters).toBeNull();
    });
  });

  describe('groupSeriesEpisodes', () => {
    it('시리즈별로 묶어 편 번호 순으로 두고, 시리즈는 가장 앞 편 시작자가 많은 순이다', () => {
      // given — 순서가 섞인 입력
      const rows = [
        row('a', 2, { starters: 3 }),
        row('b', 1, { starters: 9, nextEpisodeNo: 2 }),
        row('a', 1, { starters: 5, nextEpisodeNo: 2 }),
        row('b', 2, { starters: 4 }),
      ];

      // when
      const series = groupSeriesEpisodes(rows);

      // then
      expect(series.map((s) => s.seriesId)).toEqual(['b', 'a']);
      expect(series[1]).toMatchObject({
        title: '시리즈 a',
        market: 'kr',
        totalEpisodes: 3,
        firstEpisodeStarters: 5,
      });
      expect(series[1].episodes.map((e) => e.episodeNo)).toEqual([1, 2]);
    });

    it('행이 없으면 빈 목록이다', () => {
      expect(groupSeriesEpisodes([])).toEqual([]);
    });
  });
});
