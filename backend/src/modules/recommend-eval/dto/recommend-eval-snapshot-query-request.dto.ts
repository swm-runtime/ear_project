import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  SNAPSHOT_DEFAULT_MAX_USERS,
  SNAPSHOT_DEFAULT_SIGNAL_DAYS,
  SNAPSHOT_MAX_USERS,
} from '../recommend-eval-snapshot.service';

/** `GET /admin/recommend-eval/snapshot?max_users=&signal_days=` (admin-api.md 4.18) */
export class RecommendEvalSnapshotQueryRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SNAPSHOT_MAX_USERS)
  readonly max_users?: number = SNAPSHOT_DEFAULT_MAX_USERS;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  readonly signal_days?: number = SNAPSHOT_DEFAULT_SIGNAL_DAYS;
}
