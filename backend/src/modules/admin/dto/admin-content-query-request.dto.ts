import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { ContentStatus } from '@/modules/content/content.enum';

import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_MAX_LIMIT,
} from '../admin.constant';
import { UserMarket } from '@/modules/user/user.enum';

export class AdminContentQueryRequestDto {
  @IsOptional()
  @IsEnum(ContentStatus)
  readonly status?: ContentStatus;

  /** 시장 필터(`global-api.md` 4.10). 없으면 전 시장 */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly offset?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_MAX_LIMIT)
  readonly limit?: number = ADMIN_LIST_DEFAULT_LIMIT;
}
