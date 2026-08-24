import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  MAX_EXPLORE_PAGE_SIZE,
  MAX_EXPLORE_TOPIC_FILTER_SIZE,
  MAX_SEARCH_QUERY_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
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
 * explore-api.md 4.5.
 *
 * DTO는 **형식만 본다** — 트림 후 2자·문자 포함까지가 여기 몫이고, NFC 정규화 후의
 * 재검증(NFD 분해형 경계)과 매칭은 Orchestrator·content 모듈의 몫이다.
 */
export class ExploreSearchQueryRequestDto {
  /**
   * 검색어. **트림 후 2자 이상**(explore.md 4.5-2)이며, 특수문자·이모지만인 입력은
   * 클라이언트가 보내지 않지만 서버도 같은 기준으로 방어한다 — `VALIDATION_FAILED`(400).
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(MIN_SEARCH_QUERY_LENGTH)
  @MaxLength(MAX_SEARCH_QUERY_LENGTH)
  @Matches(/[\p{L}\p{N}]/u)
  readonly query: string;

  /** `?topic_ids=uuid,uuid` — 검색 결과에 주제 필터를 겹칠 때. 주제끼리는 OR다 */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? splitCsv(value) : value,
  )
  @IsArray()
  @ArrayMaxSize(MAX_EXPLORE_TOPIC_FILTER_SIZE)
  @IsUUID('4', { each: true })
  readonly topic_ids?: string[];

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
