import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  INSIGHTS_SUMMARY_DEFAULT_DAYS,
  INSIGHTS_SUMMARY_MAX_DAYS,
} from '../admin.constant';

/** `GET /admin/insights/summary?days=` (admin-api.md 4.22) — 추이·창 집계의 일수. 없으면 14 */
export class AdminInsightsSummaryQueryRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INSIGHTS_SUMMARY_MAX_DAYS)
  readonly days: number = INSIGHTS_SUMMARY_DEFAULT_DAYS;
}
