import { StatsPeriodType } from '@/modules/content/content.enum';

import { ExplorePopularListResult } from '../explore.types';
import { ExploreItemDto } from './explore-item.dto';

/**
 * explore-api.md 4.2-1.
 *
 * 행 모양은 피드(4.1)·주제 필터 목록(4.2)의 `items[]`와 **완전히 같다** — 세 조회가 다른 행
 * 타입을 쓰면 담기·재생 처리가 세 벌이 된다.
 *
 * **`period`를 되돌리는 이유**: 미전송 시 서버가 채운 기본값을 클라이언트가 알아야 토글의
 * 선택 상태를 그릴 수 있다. 기본값을 양쪽에 두면 서버가 그것을 바꿀 때 화면과 어긋난다.
 *
 * **`items: []`는 발행 콘텐츠 자체가 0건일 때만 나온다.** 확정 구간이 없어도 목록을 비우지
 * 않는다 — 집계가 전부 비면 동점이 되고 뒤의 정렬 키(신선도)가 순서를 정한다.
 */
export class ExplorePopularListResponseDto {
  readonly period: StatsPeriodType;
  readonly items: ExploreItemDto[];
  readonly next_cursor: string | null;
  readonly has_next: boolean;
  readonly daily_play_limit: number | null;
  readonly daily_play_count: number | null;
  readonly service_date: string;

  static from(result: ExplorePopularListResult): ExplorePopularListResponseDto {
    return {
      period: result.period,
      items: result.items.map((item) => ExploreItemDto.from(item)),
      next_cursor: result.nextCursor,
      has_next: result.hasNext,
      daily_play_limit: result.quota.dailyPlayLimit,
      daily_play_count: result.quota.dailyPlayCount,
      service_date: result.quota.serviceDate,
    };
  }
}
