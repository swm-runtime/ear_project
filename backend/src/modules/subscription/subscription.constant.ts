/** `created`로 남은 결제 의도의 보관 기간(domain.md 8.3) */
export const PURCHASE_INTENT_RETENTION_DAYS = 30;

/**
 * 만료 보정의 여유(`subscription-api.md` 4.2). 만료 시각이 이만큼 지났는데도 비종결 상태면 스토어 알림이
 * 유실된 것으로 보고 스토어에 직접 묻는다. 갱신 알림은 보통 만료 직전~직후에 오므로 그보다 넉넉히 둔다.
 */
export const RECONCILE_OVERDUE_MS = 60 * 60 * 1000;

/**
 * 만료 보정의 상한(`subscription-api.md` 4.2). 스토어에 **확인할 수 없는 채로**(조회 키 미구성·스토어가 모르는
 * 구독·조회 실패 지속) 만료 시각이 이만큼 지난 비종결 구독은 만료로 내린다 — 상한이 없으면 그런 행은 영영
 * 유료로 남는다.
 *
 * 7일인 이유: App Store는 실패한 알림을 1·12·24·48·72시간 뒤에 다시 보내고 그것으로 끝이다(합 약 6.5일).
 * 그 뒤에는 늦은 갱신 알림이 올 가능성이 없다. 유예 기간은 이미 `expires_at`에 들어 있어 여기에 더하지 않는다.
 */
export const RECONCILE_FORCE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
