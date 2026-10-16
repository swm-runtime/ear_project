import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { LocaleInputDto } from '@/modules/user/dto/locale-input.dto';

/** auth-api.md 4.x — 가입 화면에서 고른 콘텐츠 언어로 동의 목록을 다시 받는다(KAN-215·216) */
export class SignUpConsentsRequestDto {
  @IsString()
  @MaxLength(4096)
  readonly signup_token: string;

  /** sign-up(4.2)과 같은 객체 — 같은 값이면 sign-up과 같은 시장으로 판정한다 */
  @IsOptional()
  @ValidateNested()
  @Type(() => LocaleInputDto)
  readonly locale?: LocaleInputDto;
}
