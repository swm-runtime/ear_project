import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  MAX_EXPLORE_PAGE_SIZE,
  MAX_EXPLORE_TOPIC_FILTER_SIZE,
} from '../explore.constant';

/** 커서는 불투명 문자열이지만 길이 상한은 둔다 — 상한 없는 문자열을 받지 않는다 */
const MAX_CURSOR_LENGTH = 512;

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * explore-api.md 4.2.
 *
 * **기본값을 DTO에 두지 않는다**(convention.md 3.3) — 미전송과 기본값 적용을 구분해야 하는
 * 쪽은 호출부이고, 기본값은 Orchestrator가 정한다.
 */
export class ExploreContentQueryRequestDto {
  /**
   * `?topic_ids=uuid,uuid` 형태로 온다. **1개 이상 필수이며 주제끼리는 OR다.**
   * 비면 400이다 — 필터가 없는 상태는 피드(4.1)가 담당한다.
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? splitCsv(value) : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EXPLORE_TOPIC_FILTER_SIZE)
  @IsUUID('4', { each: true })
  readonly topic_ids: string[];

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
