import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import {
  MAX_RELATED_CONTENT_LIMIT,
  MAX_RELATED_EXCLUDE_IDS,
} from '../explore.constant';

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * player-api.md 4.8 — `GET /contents/:content_id/related`.
 *
 * **기본값을 DTO에 두지 않는다**(convention.md 3.3) — `limit` 기본값은 Controller가 상수로 채운다.
 */
export class RelatedContentQueryRequestDto {
  /** 상한을 서버가 강제한다(architecture.md 9.3) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RELATED_CONTENT_LIMIT)
  readonly limit?: number;

  /**
   * `?exclude_ids=uuid,uuid` — 재생 목록 스냅샷에 이미 있는 편. 빈 문자열은 빈 목록이다.
   * 기준 편(경로의 `content_id`)은 보내지 않아도 서버가 뺀다
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? splitCsv(value) : value,
  )
  @IsArray()
  @ArrayMaxSize(MAX_RELATED_EXCLUDE_IDS)
  @IsUUID('4', { each: true })
  readonly exclude_ids?: string[];
}
