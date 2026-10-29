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

/**
 * 아침 알림(KAN-288, 2026-10-29) — 드립이 없는 날 그룹 현지 08:00에 "안 들은 콘텐츠"를 알린다. `notification_logs.type`은
 * `retention.morning.<변형>`이다 — 앱은 `retention.*`을 이미 처리한다(탭 이동·포그라운드 숨김·`push_open`).
 * 저녁 규칙 표(`RETENTION_RULES`)에는 넣지 않는다 — 저녁 상한(20시간·주 3건)과 서로 막지 않게 따로 센다.
 */
export const MORNING_PUSH_RULE = 'morning';
/** `retention.morning.` — 저녁 빈도 판정에서 이 머리의 기록은 뺀다 */
export const MORNING_PUSH_LOG_TYPE_PREFIX = `${RETENTION_LOG_TYPE_PREFIX}${MORNING_PUSH_RULE}.`;
/** 아침 알림 하루 1건 — 재시작 등으로 같은 그룹이 두 번 돌아도 두 번째를 막는다. 저녁 알림과는 머리가 달라 섞이지 않는다 */
export const MORNING_PUSH_DAILY_WINDOW_HOURS = 20;
/** "안 들은 콘텐츠" — 이 일수 안에 받은(드립·탐험) 편만 센다. 오래된 미청취까지 세면 "37편"처럼 숫자가 의미를 잃는다 */
export const MORNING_PUSH_UNPLAYED_RECENT_DAYS = 7;
/** "오늘 이미 들었다"의 창(시간) — 08:00에서 3시간 전 = 현지 05:00(서비스 날짜 경계) */
export const MORNING_PUSH_LISTENED_WINDOW_HOURS = 3;
/** 보관 시한 — 아침 출근길 알림이라 점심 무렵(4시간 뒤)이면 버린다 */
export const MORNING_PUSH_TTL_SEC = 4 * 60 * 60;

/** 광고성 앱 푸시 허용 시간(사용자 현지) — 21시부터 다음 날 08시까지는 보내지 않는다(정보통신망법 50조 3항) */
export const AD_PUSH_ALLOWED_FROM_LOCAL_HOUR = 8;
export const AD_PUSH_ALLOWED_UNTIL_LOCAL_HOUR = 21;
