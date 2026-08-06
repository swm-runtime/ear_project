import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  MAX_LIBRARY_PAGE_SIZE,
  MAX_LIBRARY_TOPIC_FILTER_SIZE,
} from '@/modules/library/library.constant';
import {
  LibraryItemFilter,
  LibraryItemSort,
} from '@/modules/library/library.enum';

/** 커서는 불투명 문자열이지만 길이 상한은 둔다 — 상한 없는 문자열을 받지 않는다 */
const MAX_CURSOR_LENGTH = 512;

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * library-api.md 4.1.
 *
 * **기본값을 DTO에 두지 않는다**(convention.md 3.3) — 미전송과 기본값 적용을 구분해야 하는
 * 쪽은 호출부이고, 기본값은 Orchestrator가 정한다.
 */
export class LibraryItemQueryRequestDto {
  /** 상단 탭. 서로 배타적이며 한 번에 하나만 */
  @IsOptional()
  @IsEnum(LibraryItemFilter)
  readonly filter?: LibraryItemFilter;

  /**
   * 주제 필터 팝업의 다중 선택 결과. `?topic_filter=uuid,uuid` 형태로 온다.
   * 쿼리 파라미터는 문자열이라 배열로 바꾼 뒤 검증한다.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? splitCsv(value) : value,
  )
  @IsArray()
  @ArrayMaxSize(MAX_LIBRARY_TOPIC_FILTER_SIZE)
  @IsUUID('4', { each: true })
  readonly topic_filter?: string[];

  @IsOptional()
  @IsEnum(LibraryItemSort)
  readonly sort?: LibraryItemSort;

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
  @Max(MAX_LIBRARY_PAGE_SIZE)
  readonly limit?: number;
}
