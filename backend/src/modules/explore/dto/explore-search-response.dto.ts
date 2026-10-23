import { SearchEngine } from '@/modules/content/content.types';

import {
  ExploreSearchFallback,
  ExploreSearchResult,
  SearchMatch,
} from '../explore.types';
import { ExploreItemDto, ExploreListItemDto } from './explore-item.dto';

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
  readonly popular_items: ExploreListItemDto[];

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
  /** 행마다 `matched_by`(어느 엔진에서 왔는가 — KAN-238)가 붙는다. 화면은 아직 쓰지 않는다 */
  readonly items: (ExploreListItemDto & { matched_by: SearchEngine[] })[];
  readonly next_cursor: string | null;
  readonly has_next: boolean;
  readonly fallback: SearchFallbackDto | null;
  /** 실제 검색에 쓴 정규화 질의 — 교정어 또는 입력의 정규화 값(KAN-238) */
  readonly query_used: string;
  /** 교정했으면 입력의 정규화 값("혹시 ‘OO’로" 자리), 아니면 `null` */
  readonly corrected_from: string | null;
  /** 첫 페이지에 키워드로 맞은 편이 있으면 `keyword`, 의미 결과만이면 `related`(`items`가 비면 `keyword`) */
  readonly match: SearchMatch;
  /** 이 응답을 만든 엔진 — 진단·로그 대조용 */
  readonly engines: SearchEngine[];

  /**
   * **덧붙이는 필드만** 늘었다 — 종전 네 필드(`items`·`next_cursor`·`has_next`·`fallback`)의 모양·의미는 그대로라 옛 앱
   * (1.1.0~1.3.0)은 새 필드를 무시한다
   */
  static from(result: ExploreSearchResult): ExploreSearchResponseDto {
    return {
      items: result.items.map((item, index) => ({
        ...ExploreItemDto.from(item),
        matched_by: result.matchedBy[index] ?? ['keyword'],
      })),
      next_cursor: result.nextCursor,
      has_next: result.hasNext,
      fallback: result.fallback
        ? SearchFallbackDto.from(result.fallback)
        : null,
      query_used: result.queryUsed,
      corrected_from: result.correctedFrom,
      match: result.match,
      engines: result.engines,
    };
  }
}
