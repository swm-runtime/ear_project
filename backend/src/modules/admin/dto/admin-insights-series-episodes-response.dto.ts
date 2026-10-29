import { InsightsSeriesEpisodes } from '../admin.types';

/**
 * `GET /admin/insights/series-episodes` — 시리즈 편별 시작·완청·다음 편 진행(KAN-293, 2026-10-29). 편 단위 집계뿐이다 —
 * 사용자는 수로만 들어 있고 `user_id`·이름·이메일은 없다.
 */
export class AdminInsightsSeriesEpisodesResponseDto {
  readonly generated_at: string;
  /** 요청한 콘텐츠 시장 — 없으면 null(전부) */
  readonly market: string | null;
  readonly min_age_hours: number;
  /** 1화 시작자가 많은 시리즈 먼저 */
  readonly series: {
    series_id: string;
    title: string;
    market: string;
    total_episodes: number;
    first_episode_starters: number;
    /** 편 번호 순 */
    episodes: {
      episode_no: number;
      content_id: string;
      title: string;
      duration_sec: number;
      status: string;
      next_episode_no: number | null;
      starters: number;
      completers: number;
      completion_rate: number | null;
      next_started_of_starters: number;
      next_started_of_completers: number;
      next_rate_of_starters: number | null;
      next_rate_of_completers: number | null;
    }[];
  }[];

  static from(
    v: InsightsSeriesEpisodes,
    options: { minAgeHours: number },
  ): AdminInsightsSeriesEpisodesResponseDto {
    return {
      generated_at: v.generatedAt.toISOString(),
      market: v.market,
      min_age_hours: options.minAgeHours,
      series: v.series.map((s) => ({
        series_id: s.seriesId,
        title: s.title,
        market: s.market,
        total_episodes: s.totalEpisodes,
        first_episode_starters: s.firstEpisodeStarters,
        episodes: s.episodes.map((e) => ({
          episode_no: e.episodeNo,
          content_id: e.contentId,
          title: e.title,
          duration_sec: e.durationSec,
          status: e.status,
          next_episode_no: e.nextEpisodeNo,
          starters: e.starters,
          completers: e.completers,
          completion_rate: e.completionRate,
          next_started_of_starters: e.nextStartedOfStarters,
          next_started_of_completers: e.nextStartedOfCompleters,
          next_rate_of_starters: e.nextRateOfStarters,
          next_rate_of_completers: e.nextRateOfCompleters,
        })),
      })),
    };
  }
}
