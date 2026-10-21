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
import { ConsentType } from '@/modules/user/user.enum';

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
  // 동의 종류 수만큼 — 같은 종류를 두 번 보내면 ConsentService가 거부한다(GLOBAL 가입은 국외 이전까지 5개)
  @ArrayMaxSize(Object.values(ConsentType).length)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  readonly consents: ConsentInputDto[];

  /** `global-api.md` 4.1 — 가입 화면에서 고른 콘텐츠 언어 + 기기 로케일. 없으면 시장은 기기 언어 → `kr` 폴백 */
  @IsOptional()
  @ValidateNested()
  @Type(() => LocaleInputDto)
  readonly locale?: LocaleInputDto;
}
