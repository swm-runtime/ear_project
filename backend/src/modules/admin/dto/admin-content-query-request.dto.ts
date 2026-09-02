import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { ContentStatus } from '@/modules/content/content.enum';

import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_MAX_LIMIT,
} from '../admin.constant';

export class AdminContentQueryRequestDto {
  @IsOptional()
  @IsEnum(ContentStatus)
  readonly status?: ContentStatus;

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
