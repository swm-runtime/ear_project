/**
 * domain.md 7.1 — 드립 후보에서 영구 제외된 사유.
 *
 * **필터 조건에는 쓰이지 않는다.** 운영·디버깅용이며, 이미 행이 있으면 최초 사유를 유지한다.
 * 삭제 경로(라이브러리 삭제 / 탐색 담기 해제)를 구분하지 않는다 — 결과가 같기 때문이다.
 */
export enum DripExclusionReason {
  UNSAVE = 'unsave',
  LIBRARY_DELETE = 'library_delete',
  PLAYED = 'played',
  DRIPPED = 'dripped',
}

/**
 * domain.md 7.4 — 온보딩 첫 드립 편성 작업의 상태.
 *
 * `no_candidates`를 실패로 뭉뚱그리지 않는다. 재시도해도 결과가 바뀌지 않는 **종료 상태**라,
 * 실패로 취급하면 서버가 헛된 재시도를 하고 사용자는 대기 상한까지 기다린다.
 */
export enum FirstDripJobStatus {
  /** 편성 진행 중 — 클라이언트는 계속 폴링한다 */
  PENDING = 'pending',
  /** 적립 완료 */
  COMPLETED = 'completed',
  /** 후보 고갈 — 실패가 아니다. 재시도하지 않는다 */
  NO_CANDIDATES = 'no_candidates',
  /** 서버가 자체 재시도를 소진해 비동기 재시도 큐로 넘김 */
  QUEUED = 'queued',
  /** 큐 적재까지 실패 — 운영 알림 대상 */
  FAILED = 'failed',
}

/** 클라이언트가 더 폴링할 이유가 없는 상태 (onboarding-api.md 4.8) */
export const TERMINAL_FIRST_DRIP_STATUSES: readonly FirstDripJobStatus[] = [
  FirstDripJobStatus.COMPLETED,
  FirstDripJobStatus.NO_CANDIDATES,
  FirstDripJobStatus.QUEUED,
  FirstDripJobStatus.FAILED,
];

/** 서버가 다시 시도해 볼 여지가 있는 상태 — 재시도 스케줄러가 집어 간다 */
export const RETRYABLE_FIRST_DRIP_STATUSES: readonly FirstDripJobStatus[] = [
  FirstDripJobStatus.PENDING,
  FirstDripJobStatus.QUEUED,
];
