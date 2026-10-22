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
  /**
   * 올린 표지(KAN-234) — `PUT /admin/series/:id/cover`로 올렸을 때만 있고 없으면 null. 콘솔이 "표지를 올렸나"를 본다.
   * null이어도 앱에는 가장 앞 편 썸네일이 표지로 나간다 — 이 칸은 앱이 쓰는 해석값이 아니라 저장된 값이다
   */
  readonly cover_url: string | null;
  /** 발행 이름(예: "키워드") — 없으면 null */
  readonly publisher_name: string | null;
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
      // 빈 문자열(저장소가 URL을 못 준 경우)은 없는 것으로 낸다 — 앱 응답의 표지 해석(`resolveSeriesCover`)과 같은 판정
      cover_url: series.coverUrl || null,
      publisher_name: series.publisherName ?? null,
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
