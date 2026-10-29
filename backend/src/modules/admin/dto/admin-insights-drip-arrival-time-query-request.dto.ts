import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { UserMarket } from '@/modules/user/user.enum';

import {
  DRIP_ARRIVAL_TIME_DEFAULT_DAYS,
  DRIP_ARRIVAL_TIME_MAX_DAYS,
} from '../admin.constant';

/** `GET /admin/insights/drip-arrival-time?days=&market=` — 창 일수(1~90, 기본 14)와 사용자의 지금 시장(없으면 통합) */
export class AdminInsightsDripArrivalTimeQueryRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DRIP_ARRIVAL_TIME_MAX_DAYS)
  readonly days: number = DRIP_ARRIVAL_TIME_DEFAULT_DAYS;

  /** 지금 시장(`users.market`)으로 거른다 — 요약(`summary`)의 알림 반응과 같은 규칙 */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;
}
