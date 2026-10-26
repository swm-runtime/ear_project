/** 발송 시각(현지) — 퇴근길(`notification.md` 4.6). 광고성 알림의 야간 금지(21~08시) 안쪽이다 */
export const RETENTION_PUSH_LOCAL_HOUR = 18;

/**
 * "오늘 이미 들었다"의 창(시간) — 18:00에서 13시간 전 = 현지 05:00(서비스 날짜 경계).
 * 서비스 날짜로 세지 않는 이유: americas 그룹의 18:00은 KST로 다음 날 아침이라 서비스 날짜가 어긋난다.
 */
export const RETENTION_PUSH_LISTENED_WINDOW_HOURS = 13;

/** 리텐션 알림 하루 1건 — 서비스 날짜 대신 최근 20시간으로 센다(그룹마다 KST 날짜가 달라서) */
export const RETENTION_PUSH_DAILY_WINDOW_HOURS = 20;
/** 최근 7일에 이 건수를 넘기지 않는다 */
export const RETENTION_PUSH_WEEKLY_CAP = 3;
export const RETENTION_PUSH_WEEKLY_WINDOW_HOURS = 7 * 24;

/** 보관 시한 — 저녁 알림이라 밤사이 꺼져 있던 기기에 다음 날 아침 뜨면 어색하다. 3시간 뒤 버린다 */
export const RETENTION_PUSH_TTL_SEC = 3 * 60 * 60;

/** `notification_logs.type` 머리 — `retention.<규칙>.<변형>`(예: `retention.weekly_rank_gap.b`) */
export const RETENTION_LOG_TYPE_PREFIX = 'retention.';

/** dry_run 로그에 규칙마다 싣는 문구 예시 수 */
export const RETENTION_DRY_RUN_SAMPLES_PER_RULE = 1;
