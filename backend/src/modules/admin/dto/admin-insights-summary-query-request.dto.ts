import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { UserMarket } from '@/modules/user/user.enum';

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

  /**
   * 사용자의 **지금 시장**(`users.market`)으로 거른다(2026-10-25). 없으면 통합(전 시장). 시장 비교(`by_market`)는 고른 시장과
   * 무관하게 늘 전 시장이다 — 통합 화면의 비교표 원천이다
   */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;
}
