import { DripBatchOrchestrator } from './drip-batch.orchestrator';
import { DripBatchScheduler } from './drip-batch.scheduler';

/**
 * 재시작 시 재개(2026-09-26). 테스트 프로세스는 클러스터 워커가 아니라 `isSchedulerProcess()`가 참이다 —
 * 워커 분기는 `cluster.util.spec.ts`가 소유한다.
 */
describe('DripBatchScheduler — 재시작 시 미완료 실행 재개', () => {
  it('부팅 직후 오늘 날짜의 미완료 실행을 resume 모드로 이어받는다', async () => {
    const orchestrator = {
      run: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DripBatchOrchestrator>;
    const scheduler = new DripBatchScheduler(orchestrator);

    scheduler.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));

    expect(orchestrator.run).toHaveBeenCalledWith(expect.any(Date), 'resume');
  });

  it('재개가 던져도 부팅은 막히지 않고 로그로만 남는다', async () => {
    const orchestrator = {
      run: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as jest.Mocked<DripBatchOrchestrator>;
    const scheduler = new DripBatchScheduler(orchestrator);

    expect(() => scheduler.onApplicationBootstrap()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(orchestrator.run).toHaveBeenCalledTimes(1);
  });

  it('05:00 정규 실행은 scheduled 모드다', async () => {
    const orchestrator = {
      run: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DripBatchOrchestrator>;
    const scheduler = new DripBatchScheduler(orchestrator);

    await scheduler.runDailyBatch();

    expect(orchestrator.run).toHaveBeenCalledWith(expect.any(Date));
  });
});
