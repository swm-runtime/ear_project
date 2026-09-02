import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  ValidateNested,
} from 'class-validator';

import { ConsentInputDto } from './consent-input.dto';

/** auth-api.md 4.5 — 약관 재동의·마케팅 수신 동의 변경 */
export class UpdateConsentsRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  readonly consents: ConsentInputDto[];
}
