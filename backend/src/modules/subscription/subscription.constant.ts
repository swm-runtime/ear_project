/** `created`로 남은 결제 의도의 보관 기간(domain.md 8.3) */
export const PURCHASE_INTENT_RETENTION_DAYS = 30;

/**
 * 만료 보정의 여유(`subscription-api.md` 4.2). 만료 시각이 이만큼 지났는데도 비종결 상태면 스토어 알림이
 * 유실된 것으로 보고 스토어에 직접 묻는다. 갱신 알림은 보통 만료 직전~직후에 오므로 그보다 넉넉히 둔다.
 */
export const RECONCILE_OVERDUE_MS = 60 * 60 * 1000;
