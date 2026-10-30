import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { UserMarket } from '@/modules/user/user.enum';

import {
  CONTENT_REVIEW_ADMIN_DEFAULT_LIMIT,
  CONTENT_REVIEW_ADMIN_MAX_LIMIT,
} from '../content-review.constant';

/** `GET /admin/content-reviews` (content-review-api.md 4.9) */
export class AdminContentReviewListQueryRequestDto {
  @IsOptional()
  @IsUUID()
  readonly content_id?: string;

  /** 후기를 쓴(고친) 때의 사용자 시장 */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;

  /** `true` | `false` 문자열만 — 그 밖은 문자열로 남아 `IsBoolean`이 400 으로 거절한다 */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  readonly has_text?: boolean;

  @IsOptional()
  @IsString()
  readonly cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONTENT_REVIEW_ADMIN_MAX_LIMIT)
  readonly limit?: number = CONTENT_REVIEW_ADMIN_DEFAULT_LIMIT;
}
