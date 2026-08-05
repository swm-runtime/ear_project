/**
 * onboarding.md 4 [완료] — 첫 드립 트리거 실패 시의 재시도 규칙.
 * 공통 규칙을 그대로 따른다(`common-error-handling.md` 4.2) — 화면·모듈마다 재시도 정책이
 * 갈리면 오류 동작을 예측할 수 없게 된다.
 */

/** 최대 2회 재시도 = 총 3회 시도 */
export const FIRST_DRIP_MAX_RETRY_COUNT = 2;

/** 백오프 1초 → 3초 */
export const FIRST_DRIP_BACKOFF_MS: readonly number[] = [1000, 3000];

/** 지터 ±20% — 재시도가 한 시점에 몰리는 것을 막는다 */
export const FIRST_DRIP_BACKOFF_JITTER_RATIO = 0.2;

/**
 * 재시도 스케줄러가 한 작업을 포기하는 누적 시도 횟수.
 *
 * 요청 안에서 3회를 쓰고 `queued`로 넘어온 뒤에도 스케줄러가 몇 번 더 시도한다.
 * 여기까지 실패하면 `failed`로 두고 운영 알림에 맡긴다 — 무한 재시도는 장애를 늘린다.
 */
export const FIRST_DRIP_MAX_TOTAL_ATTEMPT_COUNT = 10;

/** 재시도 스케줄러 주기(ms) */
export const FIRST_DRIP_RETRY_INTERVAL_MS = 30_000;

/**
 * 마지막 시도로부터 이 시간이 지나야 스케줄러가 다시 집는다.
 * 요청 안에서 진행 중인 작업을 스케줄러가 겹쳐 실행하지 않게 하는 간격이다.
 */
export const FIRST_DRIP_RETRY_STALE_MS = 60_000;

/** 한 번의 스케줄러 실행에서 처리할 작업 수 */
export const FIRST_DRIP_RETRY_BATCH_SIZE = 20;
