import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

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
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  readonly consents: ConsentInputDto[];
}
