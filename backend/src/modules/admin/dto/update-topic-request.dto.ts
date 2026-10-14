import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import {
  TOPIC_SLUG_MAX_LENGTH,
  TOPIC_SLUG_PATTERN,
} from '@/modules/interest/interest.constant';

/** admin.md 4.5 — 담긴 키만 바꾼다 */
export class UpdateTopicRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly parent_category?: string;

  @IsOptional()
  @IsBoolean()
  readonly is_visible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly display_order?: number;

  /** 주제 이미지 매핑 키(`global-api.md` 4.5). `null`이면 비운다 */
  @IsOptional()
  @IsString()
  @MaxLength(TOPIC_SLUG_MAX_LENGTH)
  @Matches(TOPIC_SLUG_PATTERN)
  readonly slug?: string | null;
}
