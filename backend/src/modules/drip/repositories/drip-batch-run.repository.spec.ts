import { DripBatchRunRepository } from './drip-batch-run.repository';
import { DripBatchRunService } from '../services/drip-batch-run.service';
import { DRIP_BATCH_STALE_MS } from '../drip.constant';

const RUN_DATE = '2026-09-08';
const NOW = new Date('2026-09-08T19:00:00.000Z');

describe('DripBatchRunService', () => {
  let repository: jest.Mocked<DripBatchRunRepository>;
  let service: DripBatchRunService;

  beforeEach(() => {
    repository = {
      claim: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as unknown as jest.Mocked<DripBatchRunRepository>;

    service = new DripBatchRunService(repository);
  });

  it('오래된 미완료 실행은 다시 집을 수 있도록 기준 시각을 함께 넘긴다', async () => {
    // given — 중간에 죽은 배치가 finished_at NULL로 남으면 그날 재실행이 막힌다

    // when
    await service.claim(RUN_DATE, NOW);

    // then
    expect(repository.claim).toHaveBeenCalledWith(
      RUN_DATE,
      NOW,
      new Date(NOW.getTime() - DRIP_BATCH_STALE_MS),
    );
  });

  it('기준 시각은 지금보다 과거다 — 방금 시작한 배치를 가로채지 않는다', async () => {
    // when
    await service.claim(RUN_DATE, NOW);

    // then
    const staleBefore = repository.claim.mock.calls[0][2];
    expect(staleBefore.getTime()).toBeLessThan(NOW.getTime());
  });
});
