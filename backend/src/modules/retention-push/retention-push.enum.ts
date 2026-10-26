/** 리텐션 알림 규칙(`notification.md` 4.6). 값은 `notification_logs.type`에 그대로 남는다 — 바꾸면 지난 기록과 끊긴다 */
export enum RetentionRuleKey {
  /** 이번 주 조금만 더 들으면 상위 N% */
  WEEKLY_RANK_GAP = 'weekly_rank_gap',
  /** 어제까지 N일 연속 — 오늘 끊기기 전에 */
  STREAK_KEEP = 'streak_keep',
  /** 듣던 콘텐츠가 조금 남았다 */
  RESUME_CONTENT = 'resume_content',
  /** 지금 같은 시장에서 듣는 사람 수 */
  PEERS_LISTENING = 'peers_listening',
}

/** 서버 스위치 `RETENTION_PUSH_MODE` */
export enum RetentionPushMode {
  /** 아무것도 하지 않는다(기본) */
  OFF = 'off',
  /** 대상·문구까지 정하고 보내지 않는다 — 규칙별 건수와 예시를 Slack 에 남긴다 */
  DRY_RUN = 'dry_run',
  /** 보낸다 */
  ON = 'on',
}
