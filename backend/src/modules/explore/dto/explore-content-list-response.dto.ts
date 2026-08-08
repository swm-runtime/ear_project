import { ExploreContentListResult } from '../explore.types';
import { ExploreItemDto } from './explore-item.dto';

/**
 * explore-api.md 4.2.
 *
 * 행 모양은 피드(4.1)의 `items[]`와 **완전히 같다** — 두 모드가 다른 행 타입을 쓰면 담기·재생
 * 처리가 두 벌이 된다.
 *
 * 잔여 표시값을 함께 싣는 이유: 필터 전환 후에도 표시가 유지되므로(`explore.md` 4.4-1)
 * 이 응답이 최신값 갱신 시점이 된다.
 *
 * 결과가 없으면 `items: []`다. 클라이언트는 "이 주제의 콘텐츠는 아직 없어요"를 그린다.
 */
export class ExploreContentListResponseDto {
  readonly items: ExploreItemDto[];
  readonly next_cursor: string | null;
  readonly has_next: boolean;
  readonly daily_play_limit: number | null;
  readonly daily_play_count: number | null;
  readonly service_date: string;

  static from(result: ExploreContentListResult): ExploreContentListResponseDto {
    return {
      items: result.items.map((item) => ExploreItemDto.from(item)),
      next_cursor: result.nextCursor,
      has_next: result.hasNext,
      daily_play_limit: result.quota.dailyPlayLimit,
      daily_play_count: result.quota.dailyPlayCount,
      service_date: result.quota.serviceDate,
    };
  }
}
