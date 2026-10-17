import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { SeriesStatus } from '@/modules/content/content.enum';

import {
  NOT_BLANK,
  SERIES_DESCRIPTION_MAX_LENGTH,
  SERIES_TITLE_MAX_LENGTH,
  SERIES_TOTAL_EPISODES_MAX,
} from './create-series-request.dto';

/**
 * 시리즈 고치기(KAN-134) — 담긴 키만 바꾼다. 바꿀 키가 하나도 없으면 컨트롤러가 400으로 거절한다.
 * `total_episodes`는 발행 중인 가장 큰 편 번호보다 작게 줄일 수 없다(서비스 판정 — 400 `details.field = "total_episodes"`).
 *
 * **`IsOptional`을 쓰지 않는다** — `null`도 "안 보냄"으로 넘겨 NOT NULL 컬럼에 그대로 저장하면 500이 된다(공지 수정과 같은 규칙).
 */
export class UpdateSeriesRequestDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(NOT_BLANK)
  @MaxLength(SERIES_TITLE_MAX_LENGTH)
  readonly title?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(SERIES_DESCRIPTION_MAX_LENGTH)
  readonly description?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(SERIES_TOTAL_EPISODES_MAX)
  readonly total_episodes?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(SeriesStatus)
  readonly status?: SeriesStatus;
}
