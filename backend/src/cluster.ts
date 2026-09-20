import cluster from 'node:cluster';

import { Logger } from '@nestjs/common';

import {
  SCHEDULER_WORKER_ENV,
  clusterWorkerCount,
} from '@/common/cluster.util';

import { bootstrap } from './main';

/**
 * 컨테이너 진입점(`Dockerfile` 의 `CMD`).
 *
 * `CLUSTER_WORKERS` 가 없거나 1이면 **종전과 똑같이** 앱 하나를 띄운다 — 이 파일이 하는 일이 없다.
 * 2 이상이면 primary 가 워커를 fork 해 한 포트를 나눠 쓴다(`docs/infra/scaling.md` 4장 1단계).
 *
 * **마이그레이션은 여기서 돌지 않는다.** `deploy/docker-entrypoint.sh` 가 이 진입점을 `exec` 하기
 * **전에** 한 번 돌린다. 그 순서를 바꾸면 워커 수만큼 동시에 마이그레이션이 돌아 깨진다.
 */
const logger = new Logger('Cluster');

function runPrimary(workers: number): void {
  let shuttingDown = false;
  /** 스케줄러·자원 알림을 맡은 워커. 죽으면 같은 표시를 달아 다시 띄운다 */
  let schedulerWorkerId: number | undefined;

  const fork = (isScheduler: boolean): void => {
    const worker = cluster.fork(
      isScheduler ? { [SCHEDULER_WORKER_ENV]: 'true' } : {},
    );

    if (isScheduler) {
      schedulerWorkerId = worker.id;
    }
  };

  logger.log('starting workers', { workers });

  for (let i = 0; i < workers; i += 1) {
    // 첫 워커만 스케줄러를 맡는다 — 전부 맡으면 편성 배치가 워커 수만큼 돈다
    fork(i === 0);
  }

  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) {
      // 종료 중에는 다시 띄우지 않는다. 마지막 워커가 나가면 primary 도 끝낸다
      if (Object.keys(cluster.workers ?? {}).length === 0) {
        process.exit(0);
      }
      return;
    }

    const wasScheduler = worker.id === schedulerWorkerId;
    logger.error('worker exited — restarting', {
      worker_id: worker.id,
      code,
      signal,
      scheduler: wasScheduler,
    });
    fork(wasScheduler);
  });

  /**
   * **워커에 신호를 전달한다.** docker 는 PID 1(=이 primary)에만 SIGTERM 을 보내므로, 여기서
   * 넘겨주지 않으면 워커의 `enableShutdownHooks` 가 돌지 않고 유예 시간 뒤 강제 종료된다 —
   * TypeORM 풀이 정리되지 않고 진행 중인 스케줄러 작업이 중간에 잘린다(`main.ts` 의 같은 주석,
   * 2026-09-09 감사에서 단일 프로세스로 고쳤던 문제가 클러스터에서 되살아나는 자리다).
   */
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.log('shutting down workers', { signal });

    for (const worker of Object.values(cluster.workers ?? {})) {
      worker?.kill(signal);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

const workers = clusterWorkerCount();

if (workers > 1 && cluster.isPrimary) {
  runPrimary(workers);
} else {
  void bootstrap();
}
