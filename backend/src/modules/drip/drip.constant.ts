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

/** 완료 작업 보존 기간 — `domain.md` 7.4 "`completed_at` 기준 30일 후 배치 삭제" */
export const FIRST_DRIP_JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** 완료 작업 파기 배치 주기(ms). 하루 단위 보존이라 시간 단위면 충분하다 */
export const FIRST_DRIP_PURGE_INTERVAL_MS = 60 * 60 * 1000;

/*
 * ── 편성 스코어링 (`drip-scheduling.md` 4.2 — 3축 하이브리드) ─────────────────────
 *
 * 아래 값 전부가 "서버 구현이 소유하는 초기값"이다(4.2 — 문서에 계수를 박지 않는다).
 * 시범 운영 데이터로 튜닝하며, 문서 개정 없이 조정한다.
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

/**
 * 축 결합 가중치(4.2 — 3축 하이브리드). 임베딩·취향 벡터가 없는 경우는 해당 축이 빠지고
 * 나머지가 재정규화되므로, 임베딩 미부여 상태에서는 종전 신호:메타 = 1:1 그대로 동작한다.
 */
export const AXIS_WEIGHT_EMBEDDING = 0.3;
export const AXIS_WEIGHT_SIGNAL = 0.35;
export const AXIS_WEIGHT_META = 0.35;

/**
 * MMR 다양성 감점 계수 λ(4.2-3 — "λ는 서버 구현이 소유"). 이미 뽑힌 편과의 임베딩
 * 코사인 유사도 최댓값에 곱해 스코어에서 뺀다. 점수·유사도 모두 0~1 스케일이므로
 * 0.3이면 "내용이 사실상 같은 편"(유사도 ≈ 1)이 점수 0.3만큼 밀린다.
 */
export const MMR_DIVERSITY_LAMBDA = 0.3;

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
  /**
   * 커리어 적합도(4.2 ③ "직군·연차와 맞는 콘텐츠에 소폭 가점", 신설 2026-09-11). 난이도·시리즈(0.1)보다
   * 조금 크고 주제 적합도(0.25)보다 작다 — 메타 축이 최종의 0.35이므로 전체의 약 5%. 동점 구간의
   * 순서는 확실히 바꾸되 주제·인기를 뒤집지는 않는 크기다. 시범 운영 로그(`career_fit`)로 조정한다
   */
  careerFit: 0.15,
  seriesContinuity: 0.1,
  exposureFatigue: 0.1,
} as const;

/**
 * 커리어 적합도 점수표 — 사용자 (직군, 연차 구간)과 콘텐츠 청자 세트 중 가장 가까운 것의 값.
 * 연차 구간이 이웃(`0-1`↔`2-3` 등)이면 절반 이상은 인정한다 — 연차 경계는 원래 흐릿하다.
 * 사용자 연차가 없으면 직군만 대조하고 `jobOnly`로 본다.
 */
export const CAREER_FIT_SCORES = {
  exact: 1,
  adjacentYears: 0.6,
  jobOnly: 0.3,
  none: 0,
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

/**
 * 끝나지 않은 배치 실행을 **버려진 것으로 보고 다시 집는** 기준.
 *
 * `claim`이 "이미 있으면 포기"만 하면, 중간에 프로세스가 죽은 날은 `finished_at`이 NULL로
 * 남아 **그날 남은 사용자 전원이 드립을 받지 못하고 재실행도 막힌다.** 복구가 수동
 * `DELETE`뿐인 상태를 만들지 않는다(architecture.md 8.5 — "어떤 시점에 프로세스가 죽어도
 * 재시작 시 안전하게 이어갈 수 있어야 한다").
 *
 * 재실행 자체는 안전하다 — 적립은 유니크 + `orIgnore`, 제외 목록은 별도 행이라 두 번
 * 돌아도 결과가 같다(멱등).
 *
 * 값은 정상 실행이 끝나는 데 걸리는 시간보다 넉넉해야 한다. 짧으면 아직 돌고 있는 배치를
 * 다른 인스턴스가 가로채 같은 사용자를 동시에 처리한다.
 */
export const DRIP_BATCH_STALE_MS = 2 * 60 * 60 * 1000;

/*
 * ── 탐험 편성 (`drip-scheduling.md` 4.8) ─────────────────────────────────────────
 */

/**
 * 품질 최소선(4.8-3) — 스무딩 완청률이 하한 미만이면 탐험 후보에서 제외한다.
 *
 * 실제 하한은 `min(이 값, 후보들의 전형적(단순 평균) 스무딩 완청률 × DISCOVERY_QUALITY_FLOOR_POOL_RATIO)`다. 절대값 하나만
 * 두면 **카탈로그 전체의 완청률이 낮은 시기**(콘텐츠 7편을 테스터가 훑어보던 2026-09-10 실서버)에
 * 스무딩이 모든 후보를 풀 평균으로 끌어내려 **탐험 후보가 0이 됐다.** 하한의 목적은 "카탈로그 안에서
 * 상대적으로 안 듣는 콘텐츠"를 빼는 것이고, 카탈로그 전체가 아직 안 듣는 상태라면 뺄 것이 없다.
 */
export const DISCOVERY_QUALITY_FLOOR_RATE = 0.2;

/** 전형값 대비 상대 하한 — 후보 평균의 절반 미만이면 "상대적으로 안 듣는 콘텐츠"다 */
export const DISCOVERY_QUALITY_FLOOR_POOL_RATIO = 0.5;

/**
 * 하한을 적용하기 위한 최소 재생 표본. 이보다 적으면 품질을 판정할 근거가 없으므로 통과시킨다 —
 * 신작·저노출 콘텐츠에 처음 노출을 주는 것이 탐험 슬롯의 존재 이유다(4.8-2).
 */
export const DISCOVERY_QUALITY_MIN_PLAY_COUNT = 5;

/** 탐험 선정 가중치 — 저노출이 존재 이유이므로 가장 크다(4.8-2) */
export const DISCOVERY_ITEM_WEIGHTS = {
  lowExposure: 0.5,
  freshness: 0.3,
  quality: 0.2,
} as const;
