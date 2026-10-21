import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { PreferredLanguage } from '../user.enum';
import { LocaleInput } from '../user.types';

/**
 * `global-api.md` 4.1 `locale` — 가입·로그인 요청과 기기 등록이 싣는 로케일. 전부 선택.
 * 형식은 느슨하게 받고(`MaxLength`) 값의 유효성은 `market.policy.ts`가 판정한다 — 모르는 값은 버리고 가입을 막지 않는다.
 */
export class LocaleInputDto {
  /** 가입 화면에서 고른 콘텐츠 언어. 계정 생성 때만 쓰인다(시장 판정). 그 뒤 로그인에 와도 무시 */
  @IsOptional()
  @IsEnum(PreferredLanguage)
  readonly preferred_language?: PreferredLanguage;

  /** 기기 언어 BCP 47(`getLocales()[0].languageTag`) */
  @IsOptional()
  @IsString()
  // 64: 유니코드 확장이 붙은 태그(`ja-JP-u-ca-japanese`)를 검증에서 막지 않는다 — 확장은 `normalizeLanguageCode`가 잘라 16자로 저장
  @MaxLength(64)
  readonly language_code?: string;

  /** 기기 지역 ISO 3166-1 alpha-2 */
  @IsOptional()
  @IsString()
  @Length(2, 2)
  readonly region_code?: string;

  /** 기기 시간대 IANA */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly timezone?: string;
}

export function toLocaleInput(
  dto: LocaleInputDto | undefined,
): LocaleInput | undefined {
  if (dto === undefined) {
    return undefined;
  }

  return {
    preferredLanguage: dto.preferred_language ?? null,
    languageCode: dto.language_code ?? null,
    regionCode: dto.region_code ?? null,
    timezone: dto.timezone ?? null,
  };
}
