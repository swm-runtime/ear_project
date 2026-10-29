import { IsEnum, IsOptional } from 'class-validator';

import { UserMarket } from '@/modules/user/user.enum';

/** `GET /admin/insights/short-variant?market=` — 콘텐츠 시장(`contents.market`)으로 거른다. 없으면 전부 */
export class AdminInsightsShortVariantQueryRequestDto {
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;
}
