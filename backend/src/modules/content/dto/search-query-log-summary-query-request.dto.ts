import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

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
}
