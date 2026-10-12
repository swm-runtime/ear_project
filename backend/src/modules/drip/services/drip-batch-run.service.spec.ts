import { DRIP_BATCH_STALE_MS } from '../drip.constant';
import { DripBatchRun } from '../entities/drip-batch-run.entity';
import { DripBatchRunRepository } from '../repositories/drip-batch-run.repository';
import { DripBatchRunService } from './drip-batch-run.service';

describe('DripBatchRunService — 실행 선점', () => {
  const NOW = new Date('2026-10-12T19:30:00.000Z'); // 10/13 04:30 KST — 경계 뒤, 05:00 크론 전
  let repository: jest.Mocked<
    Pick<DripBatchRunRepository, 'claim' | 'reclaimUnfinished'>
  >;
  let service: DripBatchRunService;

  beforeEach(() => {
    repository = {
      claim: jest.fn().mockResolvedValue({ id: 'run-1' }),
      reclaimUnfinished: jest.fn().mockResolvedValue(null),
    };
    service = new DripBatchRunService(
      repository as unknown as DripBatchRunRepository,
    );
  });

  it('정규 경로는 INSERT 선점이고, 오래된 미완료 행만 다시 집는다', async () => {
    await expect(service.claim('2026-10-13', NOW)).resolves.toEqual({
      id: 'run-1',
    });

    expect(repository.claim).toHaveBeenCalledWith(
      '2026-10-13',
      NOW,
      new Date(NOW.getTime() - DRIP_BATCH_STALE_MS),
    );
    expect(repository.reclaimUnfinished).not.toHaveBeenCalled();
  });

  it('재개 경로는 행을 만들지 않는다 — 그날 미완료 행이 없으면 null, 배치가 예정보다 먼저 돌지 않는다', async () => {
    await expect(
      service.claim('2026-10-13', NOW, { reclaimUnfinished: true }),
    ).resolves.toBeNull();

    expect(repository.reclaimUnfinished).toHaveBeenCalledWith(
      '2026-10-13',
      NOW,
    );
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it('재개 경로는 미완료 행이 있으면 나이와 무관하게 이어받는다', async () => {
    repository.reclaimUnfinished.mockResolvedValue({
      id: 'run-dead',
    } as DripBatchRun);

    await expect(
      service.claim('2026-10-13', NOW, { reclaimUnfinished: true }),
    ).resolves.toEqual({ id: 'run-dead' });
  });
});
