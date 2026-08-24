import { ExploreSearchFallback, ExploreSearchResult } from '../explore.types';
import { ExploreItemDto } from './explore-item.dto';

class SearchRelatedTopicDto {
  readonly id: string;
  readonly name: string;
}

/**
 * 빈 결과 대체 콘텐츠(explore-api.md 4.5). `related_topics`는 탭 시 주제 필터(4.2)를
 * 호출하는 칩이고, `popular_items`는 피드 행과 같은 문법이다.
 */
class SearchFallbackDto {
  readonly related_topics: SearchRelatedTopicDto[];
  readonly popular_items: ExploreItemDto[];

  static from(fallback: ExploreSearchFallback): SearchFallbackDto {
    return {
      related_topics: fallback.relatedTopics.map((topic) => ({
        id: topic.id,
        name: topic.name,
      })),
      popular_items: fallback.popularItems.map((item) =>
        ExploreItemDto.from(item),
      ),
    };
  }
}

/**
 * explore-api.md 4.5 — 키워드 검색.
 *
 * 행 모양은 피드(4.1)의 `items[]`와 **완전히 같다** — 검색 결과만 다른 행 타입을 쓰면
 * 담기·재생 처리가 두 벌이 된다.
 *
 * **잔여 재생 표시값을 싣지 않는다**(4.5 — 검색 화면은 표시를 숨긴다). `items`가 있으면
 * `fallback: null`, 빈 결과면 같은 응답의 `fallback`으로 대체 콘텐츠를 내려준다.
 */
export class ExploreSearchResponseDto {
  readonly items: ExploreItemDto[];
  readonly next_cursor: string | null;
  readonly has_next: boolean;
  readonly fallback: SearchFallbackDto | null;

  static from(result: ExploreSearchResult): ExploreSearchResponseDto {
    return {
      items: result.items.map((item) => ExploreItemDto.from(item)),
      next_cursor: result.nextCursor,
      has_next: result.hasNext,
      fallback: result.fallback
        ? SearchFallbackDto.from(result.fallback)
        : null,
    };
  }
}
