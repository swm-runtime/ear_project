import { SeriesStatus } from '@/modules/content/content.enum';
import { SeriesWithCounts } from '@/modules/content/services/series.service';

class AdminSeriesEpisodeCountsDto {
  /** 발행 중 — 라이선스 만료 전 `published`도 센다(상태 기준) */
  readonly published: number;
  readonly withdrawn: number;
  readonly expired: number;
}

/**
 * 관리자 시리즈 항목(KAN-134) — 만들기·고치기·목록이 같은 모양이다.
 * `max_published_episode_no`는 `total_episodes`를 줄일 수 있는 하한이다(콘솔이 입력 최솟값으로 쓴다).
 */
export class AdminSeriesItemDto {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly total_episodes: number;
  readonly status: SeriesStatus;
  readonly episode_counts: AdminSeriesEpisodeCountsDto;
  readonly max_published_episode_no: number | null;
  readonly created_at: string;
  readonly updated_at: string;

  static from({ series, counts }: SeriesWithCounts): AdminSeriesItemDto {
    return {
      id: series.id,
      title: series.title,
      description: series.description,
      total_episodes: series.totalEpisodes,
      status: series.status,
      episode_counts: {
        published: counts.published,
        withdrawn: counts.withdrawn,
        expired: counts.expired,
      },
      max_published_episode_no: counts.maxPublishedEpisodeNo,
      created_at: series.createdAt.toISOString(),
      updated_at: series.updatedAt.toISOString(),
    };
  }
}

export class AdminSeriesListResponseDto {
  readonly items: AdminSeriesItemDto[];

  static from(rows: SeriesWithCounts[]): AdminSeriesListResponseDto {
    return { items: rows.map((row) => AdminSeriesItemDto.from(row)) };
  }
}
