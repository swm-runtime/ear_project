import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  NOTICE_CURSOR_MAX_LENGTH,
  NOTICE_LIST_MAX_LIMIT,
} from '../notice.constant';

/**
 * settings-api.md 4.4 · admin-api.md 4.12 — 공지 목록 쿼리.
 * 기본값은 DTO에 두지 않는다(convention.md 3.3) — Controller가 정한다.
 */
export class GetNoticesQueryRequestDto {
  /** 직전 응답의 `next_cursor`. 클라이언트가 해석하지 않는다 */
  @IsOptional()
  @IsString()
  @MaxLength(NOTICE_CURSOR_MAX_LENGTH)
  readonly cursor?: string;

  /** 상한을 서버가 강제한다(architecture.md 9.3) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTICE_LIST_MAX_LIMIT)
  readonly limit?: number;
}
