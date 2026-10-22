import { SeriesStatus } from '@/modules/content/content.enum';
import { SeriesCardView } from '@/modules/content/services/series.service';

class PublisherSeriesCardSeriesDto {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly total_episodes: number;
  readonly episode_count: number;
  readonly status: SeriesStatus;
  readonly thumbnail_url: string;
  readonly topic_ids: string[];
}

/** 탐색 시리즈 카드(explore-api.md 4.1-1)와 같은 모양 — 앱이 같은 카드로 그린다 */
class PublisherSeriesCardDto {
  readonly type: 'series';
  readonly series: PublisherSeriesCardSeriesDto;

  static from(card: SeriesCardView): PublisherSeriesCardDto {
    return {
      type: 'series',
      series: {
        id: card.series.id,
        title: card.series.title,
        description: card.series.description,
        total_episodes: card.series.totalEpisodes,
        episode_count: card.episodeCount,
        status: card.series.status,
        thumbnail_url: card.coverThumbnailUrl,
        topic_ids: card.topicIds,
      },
    };
  }
}

/**
 * 같은 간행물의 다른 시리즈(`GET /series/:id/publisher-series`, explore-api.md 4.7-1 — 2026-10-22 PM). 시리즈 화면 아래
 * "○○의 다른 시리즈" 줄이다. 발행 이름이 없거나 다른 시리즈가 없으면 `items`가 빈 배열이다(앱은 줄째 숨긴다)
 */
export class GetPublisherSeriesResponseDto {
  readonly publisher_name: string | null;
  readonly items: PublisherSeriesCardDto[];

  static from(view: {
    publisherName: string | null;
    cards: SeriesCardView[];
  }): GetPublisherSeriesResponseDto {
    return {
      publisher_name: view.publisherName,
      items: view.cards.map((card) => PublisherSeriesCardDto.from(card)),
    };
  }
}
