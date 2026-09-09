/**
 * 커서 페이로드 값의 **정의역 검증**.
 *
 * 커서는 서명되지 않은 base64url JSON이라(`explore.cursor.ts` 설계 메모) 인증된 사용자
 * 누구나 내용을 고쳐 보낼 수 있다. **타입만 보고 값의 범위를 보지 않으면** 그 값이 그대로
 * SQL 비교식에 들어가 Postgres가 던진다 — uuid 컬럼에 `"x"`, int 컬럼에 `1.5`.
 *
 * 그 예외는 `QueryFailedError`라 전역 필터가 **500 `INTERNAL_ERROR`(`retryable: true`)** 로
 * 바꾸고, 클라이언트는 계약(4xx면 커서를 버린다)이 아니라 재시도 규칙을 따라 **같은 커서로
 * 계속 다시 호출한다.** 계약은 400(`EXPLORE_CURSOR_INVALID` · `LIBRARY_CURSOR_INVALID`,
 * `retryable: false`)이다.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres `int4` 상한. 넘으면 비교식에서 `integer out of range`가 난다 */
const INT4_MAX = 2_147_483_647;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** 정렬 키로 쓰이는 카운트 — 음수·소수·범위 밖을 전부 막는다 */
export function isCountValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= INT4_MAX
  );
}

/** 0~1 사이의 점수(검색 랭킹 가중치 등) */
export function isRatioValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

/** `timestamptz` 비교에 들어가는 값 — 파싱되지 않으면 `Invalid Date`가 그대로 흘러간다 */
export function isTimestampValue(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}
