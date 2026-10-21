import { ExploreItemView } from '../explore.types';
import { ExploreItemDto } from './explore-item.dto';

/**
 * player-api.md 4.8 — 관련 콘텐츠 목록.
 *
 * 행 모양은 **탐색 콘텐츠 행(explore-api.md 4.1)과 같다** — 추천 블록의 담기·재생 처리가 탐색 행 처리를 그대로 쓴다.
 * 시리즈 카드로 접지 않으므로 `type` 키가 없다(편 단위). 페이지가 아니라 커서·`has_next`가 없고, 잔여 재생 표시값도
 * 싣지 않는다(플레이어가 이미 갖고 있다). 결과가 없으면 `items: []`다.
 */
export class RelatedContentListResponseDto {
  readonly items: ExploreItemDto[];

  static from(items: ExploreItemView[]): RelatedContentListResponseDto {
    return {
      // `ExploreItemView`(type 키 없음)만 들어오므로 언제나 콘텐츠 행이다
      items: items.map((item) => ExploreItemDto.from(item) as ExploreItemDto),
    };
  }
}
