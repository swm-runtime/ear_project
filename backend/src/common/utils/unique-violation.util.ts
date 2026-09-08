import { QueryFailedError } from 'typeorm';

/** Postgres unique_violation */
const UNIQUE_VIOLATION_CODE = '23505';

/**
 * 유니크 위반인지 판정한다.
 *
 * architecture.md 8.4 — **유니크 위반 예외를 도메인 흐름으로 흡수할 수 있는 경우
 * 예외로 만들지 않는다.** 동시 요청 둘 중 하나가 제약에 걸리는 것은 제약이 제 일을 한
 * 것이지 장애가 아니다. 그대로 두면 500 `INTERNAL_ERROR`(retryable: true)로 나가서
 * 클라이언트가 같은 요청을 자동 재시도한다.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code ===
      UNIQUE_VIOLATION_CODE
  );
}
