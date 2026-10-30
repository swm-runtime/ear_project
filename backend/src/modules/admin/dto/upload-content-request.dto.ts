import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  ContentLanguage,
  ContentLengthProfile,
  ContentOrigin,
} from '@/modules/content/content.enum';
import { INTRO_VERSION_PATTERN } from '@/modules/content/content-variant.policy';
import { UserMarket } from '@/modules/user/user.enum';

/** admin.md 3.1 `sources[]` — 소스마다 제목(필수) · 저자(선택) · 링크(선택) */
export class ContentSourceInputDto {
  @IsString()
  @MaxLength(255)
  readonly title: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  readonly url?: string;
}

/**
 * admin.md 3.1 — multipart의 `payload` 필드(JSON 문자열)를 파싱한 결과.
 * 파일(`audio` · `thumbnail`)은 multer가 따로 받는다.
 * origin별 필수 분기·라이선스·주제 존재 판정은 Service가 한다(DTO는 형식만).
 */
export class UploadContentRequestDto {
  @IsString()
  @MaxLength(255)
  readonly title: string;

  @IsString()
  @MaxLength(5000)
  readonly description: string;

  @IsEnum(ContentOrigin)
  readonly origin: ContentOrigin;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly author_name?: string;

  @IsString()
  @MaxLength(500)
  readonly source_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  readonly source_url?: string;

  @IsOptional()
  @IsUUID()
  readonly partner_id?: string;

  @IsOptional()
  @IsISO8601()
  readonly license_expires_at?: string;

  @IsOptional()
  @IsUUID()
  readonly series_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly episode_no?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly total_episodes?: number;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  readonly topic_ids: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ContentSourceInputDto)
  readonly sources?: ContentSourceInputDto[];

  /** admin.md 4.2-1 — 미체크는 거부. 값은 저장하지 않고 감사 로그에만 남는다 */
  @IsBoolean()
  @Equals(true)
  readonly review_confirmed: boolean;

  /**
   * `global-api.md` 4.9 — 시장. **필수**(2단계, 2026-10-19 KAN-190 — 파이프라인이 #1748부터 늘 보낸다). 빠지면 400이다.
   * 기본값으로 `kr`을 채우면 GLOBAL 콘솔이 값을 빠뜨렸을 때 영어 콘텐츠가 KR 카탈로그에 조용히 섞인다. `topic_ids`가 전부
   * 같은 시장이어야 하고, `language`와 조합(kr↔ko · global↔en)이 맞아야 한다 — 아니면 400
   */
  @IsEnum(UserMarket)
  readonly market: UserMarket;

  /** `global-api.md` 4.9 — 콘텐츠 언어. **필수**(2단계). 시장과 조합이 맞아야 한다 */
  @IsEnum(ContentLanguage)
  readonly language: ContentLanguage;

  /**
   * 길이 프로필(KAN-298 — 짧은 판 코호트). 생략하면 단편은 `standard`, 시리즈 편은 시리즈의 값이다(값이 있으면 시리즈와
   * 같아야 한다). 파이프라인 `upload-meta.json`의 `length_profile`이 그대로 온다
   */
  @IsOptional()
  @IsEnum(ContentLengthProfile)
  readonly length_profile?: ContentLengthProfile;

  /**
   * 짧은 판의 원본 콘텐츠 id(KAN-298). short 단편이면 필수, 짧은 시리즈의 편이면 원본 시리즈의 같은 화(없으면 생략),
   * standard면 넣지 않는다. 파이프라인 `upload-meta.json`의 `remake_of_content_ref` 값이다(키 이름은 이 계약을 따른다)
   */
  @IsOptional()
  @IsUUID()
  readonly variant_of_content_id?: string;

  /**
   * 도입부 버전(KAN-298 범위 추가 — `experiments-api.md` 4.3-4). **지표 전용**이고 노출에 쓰지 않는다. 생략하면 NULL(기존
   * 도입부)이다. 32자 이하, 소문자·숫자로 시작하고 소문자·숫자·`.`·`_`·`-`만(`INTRO_VERSION_PATTERN`). 값 이름은 파이프라인이
   * 정한다(예 `hook-v2`)
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(INTRO_VERSION_PATTERN)
  readonly intro_version?: string;
}

/** multipart 본문의 텍스트 필드. 파일은 여기 오지 않는다 */
export class UploadContentFormRequestDto {
  @IsString()
  @MaxLength(20000)
  readonly payload: string;
}
