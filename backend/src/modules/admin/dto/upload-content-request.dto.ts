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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { ContentOrigin } from '@/modules/content/content.enum';

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
  @MaxLength(100)
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
}

/** multipart 본문의 텍스트 필드. 파일은 여기 오지 않는다 */
export class UploadContentFormRequestDto {
  @IsString()
  @MaxLength(20000)
  readonly payload: string;
}
