import { ContentLanguage, SeriesStatus } from '@/modules/content/content.enum';
import { ContentSeriesDto } from '@/modules/content/dto/content-series.dto';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';

import { SeriesDetailView, SeriesEpisodeView } from '../series-detail.types';

class SeriesDetailSeriesDto {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** 계획 편수(시리즈 표). 아래 `episodes`는 노출 중인 편만이라 이보다 적을 수 있다 */
  readonly total_episodes: number;
  readonly status: SeriesStatus;
  /** 표지 — 시리즈 표지(`series.cover_url`, KAN-234)가 있으면 그것, 없으면 노출 중인 가장 앞 편(보통 1화)의 썸네일 */
  readonly thumbnail_url: string;
  /**
   * 대표 중분류(주제) — 앨범 화면 제목 아래 카테고리 줄(explore-api.md 4.7). 편들의 주제 중 가장 많은 편에 걸린 하나
   * (동률은 `display_order` 우선). 노출 편에 주제가 없으면 null
   */
  readonly topic: { id: string; name: string } | null;
  /**
   * 시리즈째 담았는가(`library_series` 살아 있는 행 — KAN-245). true면 새로 공개되는 편이 라이브러리에 따라 들어온다.
   * 편이 전부 담겼는지와 다르다 — 편 하나씩 다 담아도 false다. **추가 필드라 설치된 앱은 무시한다**
   */
  readonly is_saved: boolean;
  /** 발행일자(ISO 8601) — 노출 편 중 가장 이른 발행 시각. 앨범 화면 하단 발행일 자리(explore-api.md 4.7) */
  readonly published_at: string;
}

/** 탐색 카드의 `content`와 같은 모양(explore-api.md 4.1) — 화면이 같은 행 컴포넌트를 쓴다 */
class SeriesEpisodeContentDto {
  readonly id: string;
  readonly title: string;
  readonly author_name: string | null;
  readonly source_name: string;
  readonly source_url: string | null;
  readonly duration_sec: number;
  readonly thumbnail_url: string;
  readonly language: ContentLanguage;
  readonly content_version: number;
  readonly topic_ids: string[];
  readonly tags: string[];
  readonly series: ContentSeriesDto | null;
}

/** 탐색 카드의 `library`와 같은 모양 — 안 담았으면 null */
class SeriesEpisodeLibraryDto {
  readonly item_id: string;
  readonly source: LibraryItemSource;
  readonly status: LibraryItemStatus;
}

class SeriesEpisodeProgressDto {
  readonly position_sec: number;
  readonly max_reached_sec: number;
}

export class SeriesEpisodeItemDto {
  readonly episode_no: number;
  readonly content: SeriesEpisodeContentDto;
  /** 내 상태 — 담음 여부·완청(`status = completed`). 담지 않았으면 null */
  readonly library: SeriesEpisodeLibraryDto | null;
  /** 재생 위치. **행이 없으면 null이며 0으로 채우지 않는다**(라이브러리 항목과 같은 규칙) */
  readonly progress: SeriesEpisodeProgressDto | null;
  /** 재생 확인 팝업 힌트. **판정이 아니다**(paywall.md 4.3-1) */
  readonly is_counted_today: boolean;

  static from(view: SeriesEpisodeView): SeriesEpisodeItemDto {
    const { content } = view;

    return {
      episode_no: view.series.episodeNo,
      content: {
        id: content.id,
        title: content.title,
        author_name: content.authorName,
        source_name: content.sourceName,
        source_url: content.sourceUrl || null, // 빈 문자열 = 원문 없음 — 탐색 카드와 같은 규칙
        duration_sec: content.durationSec,
        thumbnail_url: content.thumbnailUrl,
        language: content.language,
        content_version: content.contentVersion,
        topic_ids: view.topicIds,
        tags: content.tags ?? [],
        series: ContentSeriesDto.from(view.series),
      },
      library: view.libraryItem
        ? {
            item_id: view.libraryItem.id,
            source: view.libraryItem.source,
            status: view.libraryItem.status,
          }
        : null,
      progress: view.progress
        ? {
            position_sec: view.progress.positionSec,
            max_reached_sec: view.progress.maxReachedSec,
          }
        : null,
      is_counted_today: view.isCountedToday,
    };
  }
}

/**
 * `GET /series/:series_id`(KAN-134 확정 설계 3번) — 탐색에서 시리즈를 눌렀을 때의 화면 데이터.
 * 시리즈 정보 · 표지 · 노출 중인 편 목록(`episode_no` 순) · 편마다 내 상태. 다음 화 같은 필드는 두지 않는다(보류 결정).
 */
export class GetSeriesDetailResponseDto {
  readonly series: SeriesDetailSeriesDto;
  readonly episodes: SeriesEpisodeItemDto[];

  static from(view: SeriesDetailView): GetSeriesDetailResponseDto {
    return {
      series: {
        id: view.series.id,
        title: view.series.title,
        description: view.series.description,
        total_episodes: view.series.totalEpisodes,
        status: view.series.status,
        thumbnail_url: view.coverThumbnailUrl,
        topic: view.topic,
        is_saved: view.isSaved,
        published_at: view.publishedAt.toISOString(),
      },
      episodes: view.episodes.map((episode) =>
        SeriesEpisodeItemDto.from(episode),
      ),
    };
  }
}
