/** `notification_logs.type` — MVP에는 드립 도착 하나다(`notification.md` 3) */
export enum NotificationType {
  /** 정규 + 탐험 편을 합친 하루 1건(`notification.md` 4.3, 2026-09-17) */
  DRIP_ARRIVAL = 'drip_arrival',
}

/** domain.md 9.1 `status` */
export enum NotificationStatus {
  SCHEDULED = 'scheduled',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/** domain.md 9.1 `skip_reason` — `free_tier` · `quiet_hours`는 폐기돼 없다 */
export enum NotificationSkipReason {
  NO_PERMISSION = 'no_permission',
  TOGGLE_OFF = 'toggle_off',
  DAILY_CAP = 'daily_cap',
}
