import { DripArrivalSlot } from '@/modules/drip/drip-group.policy';
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
      DripGroup.SOUTHEAST_ASIA,
      DripGroup.EUROPE,
      DripGroup.AMERICAS,
    ]);
  });

  it('동남아 그룹은 싱가포르 현지 05:00 편성 · 07:00 알림 크론이 있다(2026-10-26)', async () => {
    // given
    const orchestrator = buildOrchestrator(Object.values(DripGroup));
    const scheduler = new DripBatchScheduler(orchestrator);

    // when
    await scheduler.runSoutheastAsiaBatch();
    await scheduler.pushSoutheastAsiaArrivals();

    // then
    expect(orchestrator.run).toHaveBeenCalledWith(
      expect.any(Date),
      'scheduled',
      DripGroup.SOUTHEAST_ASIA,
    );
    expect(orchestrator.notifyTodayArrivals).toHaveBeenCalledWith(
      expect.any(Date),
      DripGroup.SOUTHEAST_ASIA,
      DripArrivalSlot.H0700,
    );
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
      DripArrivalSlot.H0700,
    );
  });
});

describe('DripBatchScheduler — 도착 알림 시각 A/B 크론(KAN-289)', () => {
  it('07:00 · 07:30 · 08:00 크론이 그룹마다 자기 시각으로 알림을 부른다 — 어느 시각이 실제로 보낼지는 오케스트레이터가 스위치로 정한다', async () => {
    // given
    const orchestrator = buildOrchestrator(Object.values(DripGroup));
    const scheduler = new DripBatchScheduler(orchestrator);

    // when
    await scheduler.pushDripArrivals();
    await scheduler.pushDripArrivals0730();
    await scheduler.pushDripArrivals0800();
    await scheduler.pushEuropeArrivals0730();
    await scheduler.pushAmericasArrivals0800();

    // then
    expect(
      orchestrator.notifyTodayArrivals.mock.calls.map(([, group, slot]) => [
        group,
        slot,
      ]),
    ).toEqual([
      [DripGroup.ASIA, DripArrivalSlot.H0700],
      [DripGroup.ASIA, DripArrivalSlot.H0730],
      [DripGroup.ASIA, DripArrivalSlot.H0800],
      [DripGroup.EUROPE, DripArrivalSlot.H0730],
      [DripGroup.AMERICAS, DripArrivalSlot.H0800],
    ]);
  });

  it('꺼진 그룹은 07:30 · 08:00 크론도 아무것도 하지 않는다', async () => {
    // given — 기본 그룹만 켜져 있다
    const orchestrator = buildOrchestrator();
    const scheduler = new DripBatchScheduler(orchestrator);

    // when
    await scheduler.pushSoutheastAsiaArrivals0730();
    await scheduler.pushEuropeArrivals0800();

    // then
    expect(orchestrator.notifyTodayArrivals).not.toHaveBeenCalled();
  });
});
