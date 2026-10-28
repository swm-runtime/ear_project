import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { UserMarket } from '@/modules/user/user.enum';

import {
  INSIGHTS_V2_DEFAULT_WEEKS,
  INSIGHTS_V2_MAX_WEEKS,
  INSIGHTS_V2_MIN_WEEKS,
} from '../admin.constant';

/** `GET /admin/insights/v2?weeks=&market=` — 서비스 주 수(이번 주 포함, 4~12, 기본 8)와 시장(없으면 통합) */
export class AdminInsightsV2QueryRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(INSIGHTS_V2_MIN_WEEKS)
  @Max(INSIGHTS_V2_MAX_WEEKS)
  readonly weeks: number = INSIGHTS_V2_DEFAULT_WEEKS;

  /** 지금 시장(`users.market`)으로 거른다 — 요약(`summary`)과 같은 규칙 */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;
}
