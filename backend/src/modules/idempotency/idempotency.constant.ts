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
