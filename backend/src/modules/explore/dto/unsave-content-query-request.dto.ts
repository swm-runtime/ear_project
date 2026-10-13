import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

const MAX_CLIENT_SEQ = Number.MAX_SAFE_INTEGER;

/**
 * explore-api.md 4.4 — 해제는 본문이 없는 DELETE라 순번을 쿼리로 받는다.
 * 의미는 담기(4.3)와 같다 — **서버는 저장·판정하지 않고 응답에 그대로 되돌린다.**
 *
 * 쿼리 파라미터는 문자열로 오므로 숫자 변환이 필수다(convention.md 3.3).
 */
export class UnsaveContentQueryRequestDto {
  /** 빈 값·공백은 "안 보냄"이다 — `Number('')`가 0이 되어 필수값이 빈 채로 통과하지 않게 한다(2026-10-13) */
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
