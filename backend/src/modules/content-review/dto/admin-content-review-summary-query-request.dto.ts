import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { UserMarket } from '@/modules/user/user.enum';

/** `GET /admin/content-reviews/summary` (content-review-api.md 4.8) — 모르는 값은 400 */
export class AdminContentReviewSummaryQueryRequestDto {
  @IsOptional()
  @IsUUID()
  readonly content_id?: string;

  /** 편의 시장 */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;
}
