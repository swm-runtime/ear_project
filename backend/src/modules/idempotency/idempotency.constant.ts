/** convention.md 5.5 — 중복 실행 부작용이 있는 POST에 필수 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** domain.md 1.4 — 재시도 창을 넘겨 보관하지 않는다 */
export const IDEMPOTENCY_RETENTION_SEC = 24 * 60 * 60;

/**
 * 만료 행 청소 주기. 보존 기간(24시간)보다 촘촘하면 되고, 정확한 값이 계약은 아니다 —
 * 1시간이면 만료 후 최대 1시간까지만 남는다.
 */
export const IDEMPOTENCY_PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** 인증 전 호출(가입)은 계정이 없으므로 이 스코프로 묶는다 */
export const ANONYMOUS_OWNER_KEY = 'anonymous';

export function toUserOwnerKey(userId: string): string {
  return `user:${userId}`;
}

/**
 * `in_progress` 행을 **버려진 것으로 보는** 기준.
 *
 * `discard()`는 인터셉터의 `catchError`에서만 돈다. 프로세스가 죽거나 요청이 끊기면 행이
 * `in_progress`로 남고, `expires_at`(24시간)까지 그 키는 **영구 409**가 된다.
 * `domain.md` 1.4는 반대로 정한다 — "처리에 실패하면 행을 남기지 않는다. 실패한 요청은
 * 같은 키로 다시 시도할 수 있어야 한다."
 *
 * 탈퇴·이메일 인증은 클라이언트가 키를 재사용하므로, 이 상태에 걸리면 사용자가 그 동작을
 * 아예 못 하게 된다.
 *
 * 값은 **가장 느린 핸들러보다 넉넉해야 한다.** 짧으면 아직 처리 중인 요청을 버려진 것으로
 * 보고 두 번째 실행을 허용한다 — 멱등키의 목적 자체가 무너진다.
 */
export const IDEMPOTENCY_IN_PROGRESS_LEASE_MS = 60 * 1000;
