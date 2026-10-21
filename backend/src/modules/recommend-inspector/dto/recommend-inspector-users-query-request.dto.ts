import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  INSPECTOR_USERS_DEFAULT_LIMIT,
  INSPECTOR_USERS_MAX_LIMIT,
} from '../recommend-inspector.constant';
import type { InspectorUserSort } from '../recommend-inspector.types';

const SORTS: readonly InspectorUserSort[] = ['listen', 'recent'];

/** `GET /admin/insights/recommendations/users?sort=listen|recent&limit=` — 기본 `listen`·20, 최대 50 */
export class RecommendInspectorUsersQueryRequestDto {
  @IsOptional()
  @IsIn(SORTS)
  readonly sort: InspectorUserSort = 'listen';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INSPECTOR_USERS_MAX_LIMIT)
  readonly limit: number = INSPECTOR_USERS_DEFAULT_LIMIT;
}
