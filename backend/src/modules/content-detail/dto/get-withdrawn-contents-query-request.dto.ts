import { IsISO8601, Matches } from 'class-validator';

/**
 * 회수 동기화 조회(`partner-control.md` 4.3 — `GET /contents/withdrawn?since=`).
 * `since`는 클라이언트가 마지막으로 동기화한 시각(ISO 8601)이다.
 *
 * **`@IsISO8601()`만으로는 부족하다.** 그 검증은 JS `Date`가 읽지 못하는 표기(주 표기 `2026-W01`,
 * 기본형 `20260915` 등)도 통과시키는데, 그 값은 `new Date()`에서 `Invalid Date`가 되어 SQL에
 * `NaN`으로 바인딩되고 Postgres 형식 오류가 **500 `INTERNAL_ERROR`(retryable)** 로 나간다 —
 * 계약은 400 `VALIDATION_FAILED`(player-api.md 4.6)다. 클라이언트가 보내는 `toISOString()` 형태
 * (확장형 + 존 표기)로 문법을 좁힌다(`weekly-listening-query-request.dto.ts`와 같은 이유).
 */
const ISO_TIMESTAMP_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;

export class GetWithdrawnContentsQueryRequestDto {
  @IsISO8601()
  @Matches(ISO_TIMESTAMP_WITH_ZONE_PATTERN)
  readonly since: string;
}
