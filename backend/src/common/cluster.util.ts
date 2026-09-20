import cluster from 'node:cluster';
import { cpus } from 'node:os';

/**
 * 클러스터 토폴로지 — **기본은 단일 프로세스다**(`CLUSTER_WORKERS` 미설정 시 워커 1개).
 *
 * Node 는 단일 스레드라 한 프로세스가 1코어를 넘겨 쓰지 못한다. 트래픽이 한 코어를 채우면
 * 워커를 늘려 남은 코어를 쓰는데(`docs/infra/scaling.md` 4장 1단계), **그때 env 하나만 바꾸면
 * 되도록** 프로세스가 여럿이면 갈라지는 지점을 미리 여기로 모았다.
 *
 * 워커가 1개면 아래 함수들은 전부 종전과 같은 값을 돌려준다 — **지금 동작은 바뀌지 않는다.**
 */

/** 한 프로세스만 맡아야 하는 일(스케줄러·자원 알림)의 담당자임을 표시하는 env 키 */
export const SCHEDULER_WORKER_ENV = 'EAR_SCHEDULER_WORKER';

/**
 * 워커 수 상한. 이 상한이 필요한 이유는 오타 방어다 — `CLUSTER_WORKERS=64` 같은 값이 들어오면
 * DB 커넥션(워커당 풀)과 메모리가 인스턴스를 넘겨 터진다.
 */
const MAX_WORKERS = 8;

/**
 * `CLUSTER_WORKERS` 를 읽는다. `auto` 면 코어 수, 정수면 그 값(1..`MAX_WORKERS`).
 * **읽을 수 없는 값이면 1** — 잘못된 설정 때문에 예상보다 많은 프로세스가 뜨는 쪽이 더 위험하다.
 */
export function clusterWorkerCount(): number {
  const raw = process.env.CLUSTER_WORKERS?.trim();

  if (!raw) {
    return 1;
  }

  const count = raw === 'auto' ? cpus().length : Number.parseInt(raw, 10);

  if (!Number.isInteger(count) || count < 1) {
    return 1;
  }

  return Math.min(count, MAX_WORKERS);
}

/**
 * 이 프로세스가 **한 번만 일어나야 하는 일**을 맡는가. 스케줄러 등록과 Slack 자원 알림이 쓴다.
 *
 * - 클러스터가 아니면(단일 프로세스) 이 프로세스가 전부 맡는다 — 종전 동작 그대로다.
 * - 클러스터면 primary 가 fork 할 때 env 로 지정한 워커 하나만 참이다.
 *
 * **워커 id(`cluster.worker.id === 1`)로 고르지 않는 이유**: 워커가 죽어 다시 fork 되면 id 가
 * 새로 매겨져 **아무도 1번이 아니게 된다.** 그러면 편성 배치가 조용히 영영 돌지 않는다.
 */
export function isSchedulerProcess(): boolean {
  if (!cluster.isWorker) {
    return true;
  }

  return process.env[SCHEDULER_WORKER_ENV] === 'true';
}

/**
 * 프로세스마다 **따로 세는** 한도를 워커 수로 나눈다 — 레이트 리밋(인메모리 저장)과 DB 커넥션 풀.
 *
 * 나누지 않으면 워커 N개에서 실효 한도가 N배가 된다. 레이트 리밋은 방어가 목적인 숫자라
 * 2배가 되면 의미가 절반이고, DB 풀은 합이 `max_connections` 를 넘길 수 있다.
 * 워커가 1개면 `total` 을 그대로 돌려준다.
 *
 * @param min 나눈 값의 하한. 한도가 0이 되어 모든 요청이 막히는 것을 방지한다
 */
export function perWorker(total: number, min = 1): number {
  return Math.max(min, Math.round(total / clusterWorkerCount()));
}
