import { FirstDripRetryScheduler } from './first-drip-retry.scheduler';
import { FirstDripJobRepository } from './repositories/first-drip-job.repository';
import { FirstDripService } from './services/first-drip.service';

describe('FirstDripRetryScheduler', () => {
  let repository: jest.Mocked<FirstDripJobRepository>;
  let firstDripService: jest.Mocked<FirstDripService>;
  let scheduler: FirstDripRetryScheduler;

  beforeEach(() => {
    repository = {
      failExhaustedStale: jest.fn().mockResolvedValue(0),
      claimRetryable: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<FirstDripJobRepository>;
    firstDripService = {
      runClaimed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FirstDripService>;
    scheduler = new FirstDripRetryScheduler(repository, firstDripService);
  });

  it('소진된 stale 작업을 먼저 실패로 확정한 뒤 재시도할 작업을 선점한다', async () => {
    await scheduler.retryStalledJobs();

    expect(repository.failExhaustedStale).toHaveBeenCalledTimes(1);
    expect(repository.claimRetryable).toHaveBeenCalledTimes(1);
    expect(
      repository.failExhaustedStale.mock.invocationCallOrder[0],
    ).toBeLessThan(repository.claimRetryable.mock.invocationCallOrder[0]);
  });

  it('선점한 사용자마다 같은 시각으로 runClaimed 를 부른다', async () => {
    repository.claimRetryable.mockResolvedValue(['user-1', 'user-2']);

    await scheduler.retryStalledJobs();

    expect(firstDripService.runClaimed).toHaveBeenCalledTimes(2);
    const [[first, at1], [second, at2]] =
      firstDripService.runClaimed.mock.calls;
    expect([first, second]).toEqual(['user-1', 'user-2']);
    expect(at1).toBe(at2);
  });

  it('선점 단계가 실패하면 던지지 않고 이번 주기를 건너뛴다 — 던지면 인터벌이 멈춘다', async () => {
    repository.claimRetryable.mockRejectedValue(new Error('db down'));

    await expect(scheduler.retryStalledJobs()).resolves.toBeUndefined();
    expect(firstDripService.runClaimed).not.toHaveBeenCalled();
  });

  it('선점한 작업이 없으면 아무것도 실행하지 않는다', async () => {
    await scheduler.retryStalledJobs();

    expect(firstDripService.runClaimed).not.toHaveBeenCalled();
  });
});
