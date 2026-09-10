/**
 * `domain.md` 12.1 표를 코드로 옮긴 것이다. **문서의 행과 아래 상수가 1:1로 대응한다** —
 * 값이 갈리면 문서가 정한 보존 기간이 조용히 지켜지지 않게 되므로, 12.1이 바뀌면 여기도 바꾼다.
 *
 * 여기 없는 테이블은 이 배치의 대상이 아니다.
 * - `audit_logs` — **삭제하지 않는다.** 관리자 행위의 증적이다(12.1 확정 2026-09-10)
 * - `play_records` — **보류.** 프로필 통계가 전 기간 합계를 읽는다(12.1 보류 2026-09-10)
 * - `idempotency_keys` — 기간이 `created_at`이 아니라 `expires_at`이라 판정 축이 다르다.
 *   `IdempotencyPurgeScheduler`가 이미 집행한다
 */

/** `domain.md` 12.1 — 스코어링 창은 최근 90일이지만 **`content_stats` 재집계**가 원천을 필요로 해 그 두 배를 둔다 */
export const USER_SIGNAL_RETENTION_DAYS = 180;

/** `domain.md` 12.1 — `content_stats` 재집계 입력이라 `user_signals`와 같은 창을 쓴다 */
export const SOURCE_LINK_CLICK_RETENTION_DAYS = 180;

/** `domain.md` 12.1 — 이상 탐지·감사용이고 그 판단은 최근 구간으로 한다. 성장이 가장 빠른 테이블이다 */
export const AUDIO_ACCESS_LOG_RETENTION_DAYS = 90;

/** `domain.md` 12.1 — 목적이 중복 발송 방지라 그 판정 창을 넘기면 쓰이지 않는다 */
export const NOTIFICATION_LOG_RETENTION_DAYS = 90;

/**
 * 삭제 대상 테이블 이름. **문자열 유니온으로 고정한다** — 이 값이 SQL 문에 식별자로 박히므로
 * 호출부가 임의의 이름을 넘길 수 없어야 한다(`RetentionRepository`).
 */
export type RetentionTable =
  | 'user_signals'
  | 'source_link_clicks'
  | 'audio_access_logs'
  | 'notification_logs';

export interface RetentionPolicy {
  table: RetentionTable;
  retentionDays: number;
}

/** 배치가 순회하는 표. 순서는 성장 속도가 빠른 것부터다 */
export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    table: 'audio_access_logs',
    retentionDays: AUDIO_ACCESS_LOG_RETENTION_DAYS,
  },
  { table: 'user_signals', retentionDays: USER_SIGNAL_RETENTION_DAYS },
  {
    table: 'source_link_clicks',
    retentionDays: SOURCE_LINK_CLICK_RETENTION_DAYS,
  },
  {
    table: 'notification_logs',
    retentionDays: NOTIFICATION_LOG_RETENTION_DAYS,
  },
];

/**
 * 한 번의 `DELETE`가 지우는 행 수.
 *
 * **한 문장으로 다 지우지 않는 이유** — 배치를 처음 켜는 날 몇 달치가 한꺼번에 대상이 되는데,
 * 큰 `DELETE` 하나는 그 테이블의 락과 WAL을 그 시간 내내 잡는다. 재생 중 5분마다 쓰이는
 * `audio_access_logs`가 그동안 막힌다.
 */
export const RETENTION_PURGE_BATCH_SIZE = 10_000;

/**
 * 한 테이블이 한 번의 실행에서 돌 수 있는 배치 수 상한 = 1,000만 행.
 *
 * 정상 경로에서는 닿지 않는다(행은 `now()`로 생기므로 지울 대상이 실행 중에 늘어나지 않는다).
 * 예상보다 많이 쌓였을 때 **한 번의 실행이 끝없이 도는 것을 막기 위한 상한**이며, 남은 분량은
 * 다음 날 실행이 이어서 지운다.
 */
export const RETENTION_PURGE_MAX_BATCHES = 1_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 보존 기간의 경계 시각. 이보다 **오래된** 행이 삭제 대상이다.
 *
 * **04시 서비스 날짜 경계를 적용하지 않는다**(`domain.md` 1.2). 그 경계가 적용되는 곳은
 * 문서가 셋으로 못박아 뒀고(`play_records.play_date` · `content_stats` 집계 구간 ·
 * 드립 편성 `run_date`) 보존 기간은 그중 어디에도 속하지 않는다. 12.1이 정한 것은
 * "`created_at`에서 N일이 지나면"이라는 **경과 시간**이지 어느 서비스 날짜에 속하느냐가 아니다.
 */
export function toRetentionCutoff(retentionDays: number, now: Date): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}
