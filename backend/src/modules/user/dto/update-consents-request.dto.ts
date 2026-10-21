import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  ValidateNested,
} from 'class-validator';

import { ConsentInputDto } from './consent-input.dto';
import { ConsentType } from '../user.enum';

/** auth-api.md 4.5 — 약관 재동의·마케팅 수신 동의 변경 */
export class UpdateConsentsRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  // 동의 종류 수만큼 — 같은 종류를 두 번 보내면 ConsentService가 거부한다(GLOBAL 가입은 국외 이전까지 5개)
  @ArrayMaxSize(Object.values(ConsentType).length)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  readonly consents: ConsentInputDto[];
}
