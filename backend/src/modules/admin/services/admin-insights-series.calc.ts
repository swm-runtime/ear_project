import {
  InsightsSeriesEpisode,
  InsightsSeriesEpisodeRow,
  InsightsSeriesEpisodesSeries,
} from '../admin.types';

/** 분모가 0이면 null — 0%와 "잴 사람이 없다"를 구분한다 */
function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** 편 하나에 비율을 붙인다 — 다음 편이 없으면(마지막 편) 진행률은 null */
export function toSeriesEpisode(
  row: InsightsSeriesEpisodeRow,
): InsightsSeriesEpisode {
  const hasNext = row.nextEpisodeNo !== null;
  return {
    ...row,
    completionRate: ratio(row.completers, row.starters),
    nextRateOfStarters: hasNext
      ? ratio(row.nextStartedOfStarters, row.starters)
      : null,
    nextRateOfCompleters: hasNext
      ? ratio(row.nextStartedOfCompleters, row.completers)
      : null,
  };
}

/**
 * 편 행을 시리즈로 묶는다(KAN-293). 편은 편 번호 순, 시리즈는 가장 앞 편 시작자가 많은 순(같으면 제목·id 순).
 * 시리즈 시장은 가장 앞 편의 시장이다 — 같은 시리즈에 다른 시장 편은 업로드가 막는다(`series.entity.ts`).
 */
export function groupSeriesEpisodes(
  rows: InsightsSeriesEpisodeRow[],
): InsightsSeriesEpisodesSeries[] {
  const bySeries = new Map<string, InsightsSeriesEpisodeRow[]>();
  for (const row of rows) {
    const list = bySeries.get(row.seriesId) ?? [];
    list.push(row);
    bySeries.set(row.seriesId, list);
  }

  const series: InsightsSeriesEpisodesSeries[] = [];
  for (const [seriesId, list] of bySeries) {
    const episodes = [...list]
      .sort((a, b) => a.episodeNo - b.episodeNo)
      .map(toSeriesEpisode);
    const first = episodes[0];
    series.push({
      seriesId,
      title: first.seriesTitle,
      market: first.market,
      totalEpisodes: first.totalEpisodes,
      firstEpisodeStarters: first.starters,
      episodes,
    });
  }

  return series.sort(
    (a, b) =>
      b.firstEpisodeStarters - a.firstEpisodeStarters ||
      a.title.localeCompare(b.title) ||
      a.seriesId.localeCompare(b.seriesId),
  );
}
