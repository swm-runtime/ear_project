import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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
}
