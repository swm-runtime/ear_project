import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { UserMarket } from '@/modules/user/user.enum';

import {
  FUNNEL_DEFAULT_WEEKS,
  FUNNEL_MAX_WEEKS,
  FUNNEL_MIN_WEEKS,
} from '../admin.constant';

/** `GET /admin/insights/funnel?weeks=&market=` — 가입 주 묶음 수(이번 주 포함, 4~12, 기본 8)와 시장(없으면 통합) */
export class AdminInsightsFunnelQueryRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(FUNNEL_MIN_WEEKS)
  @Max(FUNNEL_MAX_WEEKS)
  readonly weeks: number = FUNNEL_DEFAULT_WEEKS;

  /** 지금 시장(`users.market`)으로 거른다 — 요약(`summary`)과 같은 규칙 */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;
}
