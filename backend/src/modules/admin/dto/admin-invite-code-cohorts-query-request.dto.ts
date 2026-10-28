import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  INSIGHTS_SUMMARY_DEFAULT_DAYS,
  INSIGHTS_SUMMARY_MAX_DAYS,
} from '../admin.constant';

/** `GET /admin/insights/invite-codes?days=` — 청취 시간의 창 일수. 없으면 14(서비스 지표 탭과 같다) */
export class AdminInviteCodeCohortsQueryRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INSIGHTS_SUMMARY_MAX_DAYS)
  readonly days: number = INSIGHTS_SUMMARY_DEFAULT_DAYS;
}
