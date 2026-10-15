import { DripGroup } from '@/modules/drip/drip.enum';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';
import { DripBatchScheduler } from './drip-batch.scheduler';

function buildOrchestrator(
  activeGroups: DripGroup[] = [DripGroup.ASIA],
): jest.Mocked<DripBatchOrchestrator> {
  return {
    run: jest.fn().mockResolvedValue(undefined),
    notifyTodayArrivals: jest.fn().mockResolvedValue(undefined),
    isGroupActive: jest.fn((group: DripGroup) => activeGroups.includes(group)),
  } as unknown as jest.Mocked<DripBatchOrchestrator>;
}

/**
 * 재시작 시 재개(2026-09-26). 테스트 프로세스는 클러스터 워커가 아니라 `isSchedulerProcess()`가 참이다 —
 * 워커 분기는 `cluster.util.spec.ts`가 소유한다.
 */
describe('DripBatchScheduler — 재시작 시 미완료 실행 재개', () => {
  it('부팅 직후 오늘 날짜의 미완료 실행을 resume 모드로 이어받는다', async () => {
    // given
    const orchestrator = buildOrchestrator();
    const scheduler = new DripBatchScheduler(orchestrator);

    // when
    scheduler.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));

    // then
    expect(orchestrator.run).toHaveBeenCalledWith(
      expect.any(Date),
      'resume',
      DripGroup.ASIA,
    );
  });

  it('재개가 던져도 부팅은 막히지 않고 로그로만 남는다', async () => {
    // given
    const orchestrator = buildOrchestrator();
    orchestrator.run.mockRejectedValue(new Error('db down'));
    const scheduler = new DripBatchScheduler(orchestrator);

    // when / then
    expect(() => scheduler.onApplicationBootstrap()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(orchestrator.run).toHaveBeenCalledTimes(1);
  });

  it('시간대 그룹이 켜져 있으면 그룹마다 재개하고, 한 그룹의 실패가 다른 그룹을 막지 않는다', async () => {
    // given — 첫 그룹(asia) 재개가 던진다
    const orchestrator = buildOrchestrator(Object.values(DripGroup));
    orchestrator.run.mockRejectedValueOnce(new Error('db down'));
    const scheduler = new DripBatchScheduler(orchestrator);

    // when
    await scheduler.resumeUnfinishedBatch();

    // then
    expect(orchestrator.run.mock.calls.map(([, , group]) => group)).toEqual([
      DripGroup.ASIA,
      DripGroup.EUROPE,
      DripGroup.AMERICAS,
    ]);
  });

  it('05:00 정규 실행은 scheduled 모드의 기본 그룹이다', async () => {
    // given
    const orchestrator = buildOrchestrator();
    const scheduler = new DripBatchScheduler(orchestrator);

    // when
    await scheduler.runDailyBatch();

    // then
    expect(orchestrator.run).toHaveBeenCalledWith(
      expect.any(Date),
      'scheduled',
      DripGroup.ASIA,
    );
  });
});

describe('DripBatchScheduler — 시간대 그룹 크론', () => {
  it('스위치가 꺼져 있으면 그룹 크론은 편성도 알림도 하지 않는다', async () => {
    // given — 기본 그룹만 켜져 있다
    const orchestrator = buildOrchestrator();
    const scheduler = new DripBatchScheduler(orchestrator);

    // when
    await scheduler.runEuropeBatch();
    await scheduler.runAmericasBatch();
    await scheduler.pushEuropeArrivals();
    await scheduler.pushAmericasArrivals();

    // then
    expect(orchestrator.run).not.toHaveBeenCalled();
    expect(orchestrator.notifyTodayArrivals).not.toHaveBeenCalled();
  });

  it('스위치가 켜져 있으면 그룹 크론이 그 그룹으로 편성·알림을 부른다', async () => {
    // given
    const orchestrator = buildOrchestrator(Object.values(DripGroup));
    const scheduler = new DripBatchScheduler(orchestrator);

    // when
    await scheduler.runAmericasBatch();
    await scheduler.pushAmericasArrivals();

    // then
    expect(orchestrator.run).toHaveBeenCalledWith(
      expect.any(Date),
      'scheduled',
      DripGroup.AMERICAS,
    );
    expect(orchestrator.notifyTodayArrivals).toHaveBeenCalledWith(
      expect.any(Date),
      DripGroup.AMERICAS,
    );
  });
});
