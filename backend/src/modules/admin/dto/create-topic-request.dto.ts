import { Type } from 'class-transformer';
import {
  IsEnum,
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
import { UserMarket } from '@/modules/user/user.enum';

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

  /** `global-api.md` 4.9 — 주제의 시장. 선택(없으면 `kr`). GLOBAL 주제는 영어 이름으로 만든다 */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;

  /** `global-api.md` 4.5 — 주제 이미지 매핑 키. 선택. 소문자·숫자·하이픈(예 `k-pop`), 시장 안에서 유일 */
  @IsOptional()
  @IsString()
  @MaxLength(TOPIC_SLUG_MAX_LENGTH)
  @Matches(TOPIC_SLUG_PATTERN)
  readonly slug?: string;
}
