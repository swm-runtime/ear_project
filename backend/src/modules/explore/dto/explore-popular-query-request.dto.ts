import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { StatsPeriodType } from '@/modules/content/content.enum';

import { MAX_EXPLORE_PAGE_SIZE } from '../explore.constant';

/** 커서는 불투명 문자열이지만 길이 상한은 둔다 — 상한 없는 문자열을 받지 않는다 */
const MAX_CURSOR_LENGTH = 512;

/**
 * explore-api.md 4.2-1.
 *
 * `period`는 `content_stats.period_type`과 **같은 값 집합**을 쓴다(`week` / `month` / `all`).
 * 화면용 enum을 따로 만들면 같은 개념이 두 벌이 되고, 구간이 늘어날 때 한쪽만 바뀐다.
 */
export class ExplorePopularQueryRequestDto {
  /**
   * 집계 구간. **미전송이면 서버가 기본 구간으로 해석한다**(`explore.constant.ts`).
   * 기본값을 DTO에 두지 않는 이유는 미전송과 기본값 적용을 구분해야 하는 쪽이 호출부이기
   * 때문이다(convention.md 3.3).
   */
  @IsOptional()
  @IsEnum(StatsPeriodType)
  readonly period?: StatsPeriodType;

  /** 직전 응답의 `next_cursor`. 클라이언트가 해석하지 않는다 */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  readonly cursor?: string;

  /** 상한을 서버가 강제한다(architecture.md 9.3) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_EXPLORE_PAGE_SIZE)
  readonly limit?: number;
}
