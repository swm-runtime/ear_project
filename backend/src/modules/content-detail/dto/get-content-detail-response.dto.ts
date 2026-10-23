import { ContentOrigin } from '@/modules/content/content.enum';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';

import { ContentDetailView } from '../content-detail.types';
import { ContentLanguage } from '@/modules/content/content.enum';
import { ContentSeriesDto } from '@/modules/content/dto/content-series.dto';

class ContentDetailTopicDto {
  readonly id: string;
  readonly name: string;
}

/**
 * 세 필드를 한 객체로 묶어 null 판정이 하나가 되게 한다 (content-detail-api.md 4.1).
 * KAN-134부터 다른 응답과 같은 `{ id, title, episode_no, total_episodes }`(`ContentSeriesDto`)에 **종전 `series_id`를 더해 둔다** —
 * 설치된 앱(1.2.1)이 `series_id`를 읽으므로 빼지 않는다(값은 `id`와 같다). `total_episodes`는 이제 시리즈 표의 값이다.
 */
class ContentDetailSeriesDto extends ContentSeriesDto {
  /** @deprecated `id`와 같은 값 — 1.2.1 호환으로만 남는다 */
  readonly series_id: string;
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
  /** 콘텐츠 언어(`global-api.md` 4.7) — 표시 전용. 시장 필터는 서버가 한다 */
  readonly language: ContentLanguage;
  readonly content_version: number;
  readonly topics: ContentDetailTopicDto[];
  /** 화면 해시태그('#' 없이 — 붙이는 것은 화면). 없으면 빈 배열 (KAN-162) */
  readonly tags: string[];
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
  /** 완청했는가 — 담지 않고 끝까지 들은 편도 true(KAN-248) */
  readonly is_completed: boolean;
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
        language: content.language,
        content_version: content.contentVersion,
        topics: view.topics.map((topic) => ({
          id: topic.id,
          name: topic.name,
        })),
        tags: content.tags ?? [],
        // 단일 콘텐츠는 null이다(domain.md 5.1) — 화면은 null 판정 하나로 줄을 생략한다
        series: view.series
          ? {
              series_id: view.series.id,
              id: view.series.id,
              title: view.series.title,
              episode_no: view.series.episodeNo,
              total_episodes: view.series.totalEpisodes,
            }
          : null,
        origin: content.origin,
        author_name: content.authorName,
        source_name: content.sourceName,
        source_url: content.sourceUrl || null, // 빈 문자열 = 원문 없음 — 발급 응답(audio-url)과 같은 규칙
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
      is_completed: view.isCompleted,
      is_counted_today: view.isCountedToday,
    };
  }
}
