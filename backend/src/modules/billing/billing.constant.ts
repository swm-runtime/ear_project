/** 복원 요청 한 번에 받는 거래 수 상한(`subscription-api.md` 4.5) */
export const MAX_RESTORE_TRANSACTIONS = 10;

/** 서명된 거래(JWS)·알림 본문의 길이 상한 — 상한 없는 문자열을 받지 않는다. 실제 값은 수 KB다 */
export const MAX_SIGNED_PAYLOAD_LENGTH = 64 * 1024;

/** 만료 보정 배치가 한 번에 보는 행 수. 알림이 정상이면 대상이 거의 없다 */
export const RECONCILE_BATCH_SIZE = 100;
