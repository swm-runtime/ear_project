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

/*
 * ── 편성 스코어링 (`drip-scheduling.md` 4.2 — 3축 하이브리드) ─────────────────────
 *
 * 아래 값 전부가 "서버 구현이 소유하는 초기값"이다(4.2 — 문서에 계수를 박지 않는다).
 * 시범 운영 데이터로 튜닝하며, 문서 개정 없이 조정한다.
 *
 * **임베딩 유사도 축(w_e)은 아직 없다** — 모델·차원 미확정(domain.md 15.1 #11)이라
 * 스코어링은 신호·메타 두 축의 재정규화 상태로 동작한다(4.2 — 결여 축 재정규화 규칙).
 * 임베딩 축이 켜지면 `tickets/backend/pending/metadata-pipeline-after-script-quality.md`의
 * 반영으로 축 가중치를 함께 재조정한다.
 */

/** `drip-scheduling.md` 4.1 — 미청취 재고가 이 수 이상이면 그날 적립(탐험 포함)을 건너뛴다 */
export const UNFINISHED_INVENTORY_LIMIT = 5;

/** `drip-scheduling.md` 4.4 — 완청 신호가 이 수 미만이면 콜드스타트다 */
export const COLD_START_COMPLETE_THRESHOLD = 3;

/** 신호 집계 조회 범위 — 최근성 가중이 사실상 0이 되는 꼬리는 읽지 않는다 */
export const SIGNAL_LOOKBACK_DAYS = 90;
export const SIGNAL_LOOKBACK_LIMIT = 500;

/** `drip-scheduling.md` 4.3 — 신호 최근성 반감기(일) */
export const SIGNAL_RECENCY_HALF_LIFE_DAYS = 14;

/** `drip-scheduling.md` 4.3 해석 표 — 신호별 기본 가중치 */
export const SIGNAL_ACTION_WEIGHTS: Readonly<Record<string, number>> = {
  complete: 1,
  replay: 1,
  save: 0.5,
  unsave: -0.6,
  delete: -0.6,
  // `play`는 해석 표에 없다 — 적재는 되지만 가중치 0으로 무시한다
  play: 0,
};

/** 가중치 맵이 무한히 자라지 않게 절대값 상위 N개만 유지한다(키워드가 주 대상) */
export const PREFERENCE_WEIGHT_MAP_LIMIT = 50;

/** 축 결합 가중치(4.2) — 임베딩 축이 켜지기 전까지 두 축을 재정규화해 쓴다 */
export const AXIS_WEIGHT_SIGNAL = 0.5;
export const AXIS_WEIGHT_META = 0.5;

/** ② 신호 선호 축 — 축 내 항목 가중치 */
export const SIGNAL_ITEM_WEIGHTS = {
  topicPreference: 0.3,
  authorPreference: 0.15,
  keywordMatch: 0.25,
  formatPreference: 0.15,
  durationCloseness: 0.15,
} as const;

/** ③ 메타 규칙 축 — 축 내 항목 가중치 (콜드스타트는 인기·신선도 비중 확대 — 4.4) */
export const META_ITEM_WEIGHTS = {
  topicMatch: 0.25,
  freshness: 0.2,
  popularity: 0.25,
  difficultyFit: 0.1,
  seriesContinuity: 0.1,
  exposureFatigue: 0.1,
} as const;
export const META_ITEM_WEIGHTS_COLD_START = {
  ...META_ITEM_WEIGHTS,
  freshness: 0.3,
  popularity: 0.45,
} as const;

/** 신선도 반감기(일) — `is_evergreen` 분기(4.2 ③): true는 감점 없음(반감기 무한) */
export const FRESHNESS_HALF_LIFE_DAYS_TIMELY = 30;
export const FRESHNESS_HALF_LIFE_DAYS_DEFAULT = 90;

/** 인기도 베이지안 스무딩 상수 C (4.2 ③ — 개정 2026-08-27) */
export const POPULARITY_SMOOTHING_C = 20;

/** 후보 풀에 재생이 하나도 없을 때의 전체 평균 완청률 폴백 */
export const GLOBAL_COMPLETE_RATE_FALLBACK = 0.5;

/** 인기도의 재생 수 성분 — log10(1+play)/이 값, 1로 캡(≈재생 1,000회에서 만점) */
export const POPULARITY_PLAY_COUNT_LOG_CAP = 3;

/** 노출 피로 조회 범위(일) — 최근 편성에서 반복된 주제 감점(4.2 ③) */
export const EXPOSURE_FATIGUE_LOOKBACK_DAYS = 14;

/** 스코어링 후보 풀 상한 — 전수 스코어링 전제의 안전판(domain.md 5.6의 규모 근거와 동일) */
export const SCORING_POOL_LIMIT = 300;

/** 편성 배치의 사용자 페이지 크기 */
export const DRIP_BATCH_USER_PAGE_SIZE = 100;

/*
 * ── 탐험 편성 (`drip-scheduling.md` 4.8) ─────────────────────────────────────────
 */

/** 품질 최소선 — 스무딩 완청률이 이 값 미만이면 탐험 후보에서 제외한다(4.8-3) */
export const DISCOVERY_QUALITY_FLOOR_RATE = 0.2;

/** 탐험 선정 가중치 — 저노출이 존재 이유이므로 가장 크다(4.8-2) */
export const DISCOVERY_ITEM_WEIGHTS = {
  lowExposure: 0.5,
  freshness: 0.3,
  quality: 0.2,
} as const;
