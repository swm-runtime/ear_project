import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { UserMarket } from '@/modules/user/user.enum';

import {
  SEARCH_QUERY_LOG_SUMMARY_DEFAULT_DAYS,
  SEARCH_QUERY_LOG_SUMMARY_MAX_DAYS,
} from '../content.constant';

/** `GET /admin/search-query-logs/summary?days=` (admin-api.md 4.21) — 집계 창(일). 없으면 14 */
export class SearchQueryLogSummaryQueryRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_QUERY_LOG_SUMMARY_MAX_DAYS)
  readonly days: number = SEARCH_QUERY_LOG_SUMMARY_DEFAULT_DAYS;

  /**
   * 검색한 사용자의 시장으로 거른다(`admin-api.md` 4.21, KAN-188). 없으면 전 시장 — 한국어·영어 질의가 한 순위와
   * 미스율에 섞이므로, 매칭 방식(한국어 `pg_trgm`)을 판단할 때는 `kr`로 본다
   */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;
}
