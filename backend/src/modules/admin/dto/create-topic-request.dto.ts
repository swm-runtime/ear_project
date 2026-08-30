import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** admin.md 3.2 — `is_visible`은 받지 않는다. 새 주제는 항상 숨김으로 시작한다(4.5) */
export class CreateTopicRequestDto {
  @IsString()
  @MaxLength(100)
  readonly name: string;

  @IsString()
  @MaxLength(100)
  readonly parent_category: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly display_order?: number;
}
