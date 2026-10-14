import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { LocaleInputDto } from '@/modules/user/dto/locale-input.dto';

import { ConsentInputDto } from '@/modules/user/dto/consent-input.dto';

/** auth-api.md 4.2 — 약관 동의를 기록하고 계정을 생성한다 */
export class SignUpRequestDto {
  @IsString()
  @MaxLength(4096)
  readonly signup_token: string;

  @IsString()
  @MaxLength(200)
  readonly device_id: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  readonly consents: ConsentInputDto[];

  /** `global-api.md` 4.1 — 가입 화면에서 고른 콘텐츠 언어 + 기기 로케일. 없으면 시장은 기기 언어 → `kr` 폴백 */
  @IsOptional()
  @ValidateNested()
  @Type(() => LocaleInputDto)
  readonly locale?: LocaleInputDto;
}
