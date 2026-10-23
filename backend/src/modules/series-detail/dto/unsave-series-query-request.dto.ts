import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

const MAX_CLIENT_SEQ = Number.MAX_SAFE_INTEGER;

/**
 * `DELETE /series/:series_id/save`(explore-api.md 4.9 — KAN-245). 본문 없는 DELETE라 순번을 쿼리로 받는다 — 편 해제
 * (`UnsaveContentQueryRequestDto`, 4.4)와 같은 규칙이다. 빈 값·공백은 "안 보냄"이다(`Number('')`가 0이 되어 필수값이
 * 빈 채로 통과하지 않게).
 */
export class UnsaveSeriesQueryRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === ''
      ? undefined
      : Number(value),
  )
  @IsInt()
  @Min(0)
  @Max(MAX_CLIENT_SEQ)
  readonly client_seq: number;
}
