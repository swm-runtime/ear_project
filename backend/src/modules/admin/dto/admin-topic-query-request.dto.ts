import { IsEnum, IsOptional } from 'class-validator';

import { UserMarket } from '@/modules/user/user.enum';

export class AdminTopicQueryRequestDto {
  /** 시장 필터(KAN-237 — `GET /admin/contents`의 `market`과 같은 방식). 없으면 전 시장 */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;
}
