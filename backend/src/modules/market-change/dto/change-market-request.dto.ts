import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, ValidateNested } from 'class-validator';

import { ConsentInputDto } from '@/modules/user/dto/consent-input.dto';
import { ConsentType, PreferredLanguage } from '@/modules/user/user.enum';

/**
 * `global-api.md` 4.11 — 옮겨 갈 시장의 필수 동의를 함께 보낸다. 이미 그 시장이면 동의는 보지 않는다(멱등 응답)라
 * 빈 배열도 형식상 받는다 — 빠진 필수 항목은 서비스가 400 `CONSENT_REQUIRED`로 거절한다.
 */
export class ChangeMarketRequestDto {
  @IsEnum(PreferredLanguage)
  readonly preferred_language: PreferredLanguage;

  @IsArray()
  @ArrayMaxSize(Object.values(ConsentType).length)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  readonly consents: ConsentInputDto[];
}
