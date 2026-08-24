import { ContentOrigin } from '@/modules/content/content.enum';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';

import { ContentDetailView } from '../content-detail.types';

class ContentDetailTopicDto {
  readonly id: string;
  readonly name: string;
}

/** 세 필드를 한 객체로 묶어 null 판정이 하나가 되게 한다 (content-detail-api.md 4.1) */
class ContentDetailSeriesDto {
  readonly series_id: string;
  readonly episode_no: number | null;
  readonly total_episodes: number | null;
}

/**
 * 소스 항목에 식별자(`id`)를 싣지 않는다 — 소스별 클릭 기록을 하지 않기 때문이다
 * (확정 2026-08-24, content-detail-api.md 4.1).
 */
class ContentDetailSourceDto {
  readonly title: string;
  readonly author: string | null;
  readonly url: string | null;
}

class ContentDetailLibraryItemDto {
  readonly id: string;
  readonly source: LibraryItemSource;
  readonly status: LibraryItemStatus;
}

class ContentDetailContentDto {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly duration_sec: number;
  readonly published_at: string;
  readonly thumbnail_url: string;
  readonly content_version: number;
  readonly topics: ContentDetailTopicDto[];
  readonly series: ContentDetailSeriesDto | null;
  readonly origin: ContentOrigin;
  readonly author_name: string | null;
  readonly source_name: string;
  readonly source_url: string | null;
  readonly sources: ContentDetailSourceDto[] | null;
}

/**
 * content-detail-api.md 4.1 — 상세 화면 전체를 이 응답 하나로 그린다.
 *
 * **`audio_path` · 서명 URL은 싣지 않는다**(architecture.md 9.4) — 상세 열람은 오디오
 * 접근이 아니다. **잔여 재생 표시값도 싣지 않는다** — 상세 화면에는 잔여 표시가 없다
 * (content-detail-api.md 2장).
 */
export class GetContentDetailResponseDto {
  readonly content: ContentDetailContentDto;
  /** `null`이면 미담김 → [담기], 값이 있으면 [삭제] — 별도 불리언을 두지 않는다 */
  readonly library_item: ContentDetailLibraryItemDto | null;
  /** 재청취 창 안인가 — 팝업 힌트이며 판정이 아니다 (paywall.md 4.3-1) */
  readonly is_counted_today: boolean;

  static from(view: ContentDetailView): GetContentDetailResponseDto {
    const { content } = view;

    return {
      content: {
        id: content.id,
        title: content.title,
        description: content.description,
        duration_sec: content.durationSec,
        published_at: content.publishedAt.toISOString(),
        thumbnail_url: content.thumbnailUrl,
        content_version: content.contentVersion,
        topics: view.topics.map((topic) => ({
          id: topic.id,
          name: topic.name,
        })),
        // 단일 콘텐츠는 셋 다 null이다(domain.md 5.1) — 화면은 null 판정 하나로 줄을 생략한다
        series: content.seriesId
          ? {
              series_id: content.seriesId,
              episode_no: content.episodeNo,
              total_episodes: content.totalEpisodes,
            }
          : null,
        origin: content.origin,
        author_name: content.authorName,
        source_name: content.sourceName,
        source_url: content.sourceUrl,
        sources:
          view.sources?.map((source) => ({
            title: source.title,
            author: source.author,
            url: source.url,
          })) ?? null,
      },
      library_item: view.libraryItem
        ? {
            id: view.libraryItem.id,
            source: view.libraryItem.source,
            status: view.libraryItem.status,
          }
        : null,
      is_counted_today: view.isCountedToday,
    };
  }
}
