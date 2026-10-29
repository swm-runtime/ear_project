import { groupSeriesEpisodes } from '../services/admin-insights-series.calc';
import { AdminInsightsSeriesEpisodesResponseDto } from './admin-insights-series-episodes-response.dto';

describe('AdminInsightsSeriesEpisodesResponseDto', () => {
  it('snake_case 로 옮기고, 사용자 식별 칸 없이 편 단위 집계만 싣는다', () => {
    // given
    const series = groupSeriesEpisodes([
      {
        seriesId: 's1',
        seriesTitle: 'CS 기초',
        totalEpisodes: 2,
        episodeNo: 1,
        contentId: 'c1',
        title: '1화',
        durationSec: 600,
        market: 'kr',
        status: 'published',
        nextEpisodeNo: 2,
        starters: 4,
        completers: 2,
        nextStartedOfStarters: 2,
        nextStartedOfCompleters: 1,
      },
    ]);

    // when
    const dto = AdminInsightsSeriesEpisodesResponseDto.from(
      {
        generatedAt: new Date('2026-10-29T00:00:00.000Z'),
        market: null,
        series,
      },
      { minAgeHours: 24 },
    );

    // then
    expect(dto).toEqual({
      generated_at: '2026-10-29T00:00:00.000Z',
      market: null,
      min_age_hours: 24,
      series: [
        {
          series_id: 's1',
          title: 'CS 기초',
          market: 'kr',
          total_episodes: 2,
          first_episode_starters: 4,
          episodes: [
            {
              episode_no: 1,
              content_id: 'c1',
              title: '1화',
              duration_sec: 600,
              status: 'published',
              next_episode_no: 2,
              starters: 4,
              completers: 2,
              completion_rate: 0.5,
              next_started_of_starters: 2,
              next_started_of_completers: 1,
              next_rate_of_starters: 0.5,
              next_rate_of_completers: 0.5,
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(dto)).not.toMatch(/user_id|email|nickname/);
  });
});
