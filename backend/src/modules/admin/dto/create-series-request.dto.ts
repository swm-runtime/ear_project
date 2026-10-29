import {
  IsEnum,
  IsInt,
  IsUUID,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  ContentLengthProfile,
  SeriesStatus,
} from '@/modules/content/content.enum';

/** 공백만 있는 제목은 1자로 세지 않는다 — 빈 제목의 시리즈가 화면에 뜨는 것을 막는다 */
export const NOT_BLANK = /\S/;
export const SERIES_TITLE_MAX_LENGTH = 255;
export const SERIES_DESCRIPTION_MAX_LENGTH = 2000;
/**
 * `integer` 컬럼 범위 — **정책 상한이 아니다**(편수 상한은 없다, 2026-10-17 결정). 범위를 넘는 값이 DB 오류(500)로
 * 나가지 않게 400으로 거절하려는 형식 검사다
 */
export const SERIES_TOTAL_EPISODES_MAX = 2_147_483_647;
/** 발행 이름 길이 — `series.publisher_name varchar(50)` */
export const SERIES_PUBLISHER_NAME_MAX_LENGTH = 50;

/** 발행 이름 정규화 — 앞뒤 공백을 걷고, 비었으면 null(없음)이다 */
export function normalizePublisherName(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 시리즈 만들기(KAN-134). 파이프라인 [시리즈 발행]이 첫 편 업로드 전에 부르고(`ai/spec/11-series.md` 7장),
 * 받은 `id`를 업로드(`admin-api.md` 4.6)의 `series_id`로 보낸다. `status`를 빼면 `ongoing`이다.
 */
export class CreateSeriesRequestDto {
  @IsString()
  @Matches(NOT_BLANK)
  @MaxLength(SERIES_TITLE_MAX_LENGTH)
  readonly title: string;

  /** 빈 문자열은 허용한다(소개 없음). 키 자체는 필수 — 빠뜨린 것과 비운 것을 구분한다 */
  @IsString()
  @MaxLength(SERIES_DESCRIPTION_MAX_LENGTH)
  readonly description: string;

  @IsInt()
  @Min(1)
  @Max(SERIES_TOTAL_EPISODES_MAX)
  readonly total_episodes: number;

  @IsOptional()
  @IsEnum(SeriesStatus)
  readonly status?: SeriesStatus;

  /** 발행 이름(예: "키워드") — 빼거나 null·빈 문자열이면 없음 */
  @IsOptional()
  @IsString()
  @MaxLength(SERIES_PUBLISHER_NAME_MAX_LENGTH)
  readonly publisher_name?: string | null;

  /** 길이 프로필(KAN-298) — 생략하면 standard. 짧은 시리즈(short)의 편은 전부 short로 올린다. 만든 뒤 바꾸지 않는다 */
  @IsOptional()
  @IsEnum(ContentLengthProfile)
  readonly length_profile?: ContentLengthProfile;

  /** 짧은 시리즈의 원본 시리즈 id(KAN-298) — short면 필수, standard면 넣지 않는다. 원본은 standard 시리즈여야 한다 */
  @IsOptional()
  @IsUUID()
  readonly variant_of_series_id?: string;
}
