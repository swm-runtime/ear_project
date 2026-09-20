import { cpus } from 'node:os';

import {
  clusterWorkerCount,
  isSchedulerProcess,
  perWorker,
} from './cluster.util';

describe('cluster.util — 클러스터 토폴로지(infra/scaling.md 5장)', () => {
  const original = process.env.CLUSTER_WORKERS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CLUSTER_WORKERS;
    } else {
      process.env.CLUSTER_WORKERS = original;
    }
  });

  describe('clusterWorkerCount', () => {
    it('설정이 없으면 1이다 — 종전 동작(단일 프로세스)을 기본으로 둔다', () => {
      delete process.env.CLUSTER_WORKERS;

      expect(clusterWorkerCount()).toBe(1);
    });

    it('정수를 주면 그 값이다', () => {
      process.env.CLUSTER_WORKERS = '2';

      expect(clusterWorkerCount()).toBe(2);
    });

    it('auto 는 코어 수다', () => {
      process.env.CLUSTER_WORKERS = 'auto';

      expect(clusterWorkerCount()).toBe(Math.min(cpus().length, 8));
    });

    it('상한 8을 넘겨 적어도 8로 잘린다 — 오타 하나로 DB 커넥션이 터지지 않게', () => {
      process.env.CLUSTER_WORKERS = '64';

      expect(clusterWorkerCount()).toBe(8);
    });

    it.each(['0', '-1', 'two', '1.5', ''])(
      '읽을 수 없는 값(%s)이면 1이다 — 잘못된 설정으로 프로세스가 늘어나는 쪽이 더 위험하다',
      (value) => {
        process.env.CLUSTER_WORKERS = value;

        expect(clusterWorkerCount()).toBe(1);
      },
    );
  });

  describe('perWorker', () => {
    it('워커가 1개면 값을 그대로 돌려준다 — 지금 한도가 바뀌지 않는다', () => {
      delete process.env.CLUSTER_WORKERS;

      expect(perWorker(300)).toBe(300);
      expect(perWorker(5)).toBe(5);
    });

    it('워커 수로 나눈다 — 프로세스마다 따로 세는 한도의 합을 유지한다', () => {
      process.env.CLUSTER_WORKERS = '2';

      expect(perWorker(300)).toBe(150);
      expect(perWorker(20)).toBe(10);
      expect(perWorker(5)).toBe(3);
    });

    it('하한 아래로는 내려가지 않는다 — 한도가 0이 되면 모든 요청이 막힌다', () => {
      process.env.CLUSTER_WORKERS = '8';

      expect(perWorker(5)).toBe(1);
      expect(perWorker(10, 2)).toBe(2);
    });
  });

  describe('isSchedulerProcess', () => {
    it('클러스터가 아니면 참이다 — 단일 프로세스가 스케줄러를 전부 맡는다', () => {
      expect(isSchedulerProcess()).toBe(true);
    });
  });
});
