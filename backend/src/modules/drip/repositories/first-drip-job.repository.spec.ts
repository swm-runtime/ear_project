import { In, LessThan, Repository } from 'typeorm';

import { TERMINAL_FIRST_DRIP_STATUSES } from '../drip.enum';

import { FirstDripJob } from '../entities/first-drip-job.entity';
import { FirstDripJobRepository } from './first-drip-job.repository';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const STALE_BEFORE = new Date('2026-08-05T08:59:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';

/**
 * 선점 쿼리는 `UPDATE ... RETURNING`이라 드라이버가 **`[행 배열, 영향받은 행 수]`** 로
 * 돌려준다. 이 모양을 행 배열로 착각해 스케줄러가 매 주기 `undefined`를 처리하려 든
 * 문제가 실제로 있었다 — 그 회귀를 막는 테스트다.
 */
describe('FirstDripJobRepository', () => {
  let repository: FirstDripJobRepository;
  let typeormRepository: jest.Mocked<Repository<FirstDripJob>>;

  beforeEach(() => {
    typeormRepository = {
      query: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 3 }),
    } as unknown as jest.Mocked<Repository<FirstDripJob>>;

    repository = new FirstDripJobRepository(typeormRepository);
  });

  describe('claimRetryable', () => {
    it('[행 배열, 영향받은 행 수] 모양의 응답에서 user_id만 꺼낸다', async () => {
      // given
      typeormRepository.query.mockResolvedValue([[{ user_id: USER_ID }], 1]);

      // when
      const userIds = await repository.claimRetryable(
        NOW,
        STALE_BEFORE,
        10,
        20,
      );

      // then
      expect(userIds).toEqual([USER_ID]);
    });

    it('갱신된 행이 없으면 빈 배열을 돌려준다', async () => {
      // given — 여기서 길이 2를 그대로 믿으면 매 주기 헛일을 한다
      typeormRepository.query.mockResolvedValue([[], 0]);

      // when
      const userIds = await repository.claimRetryable(
        NOW,
        STALE_BEFORE,
        10,
        20,
      );

      // then
      expect(userIds).toEqual([]);
    });

    it('드라이버가 행 배열만 돌려주는 경우도 처리한다', async () => {
      // given
      typeormRepository.query.mockResolvedValue([{ user_id: USER_ID }]);

      // when
      const userIds = await repository.claimRetryable(
        NOW,
        STALE_BEFORE,
        10,
        20,
      );

      // then
      expect(userIds).toEqual([USER_ID]);
    });
  });

  describe('failExhaustedStale', () => {
    it('마지막 선점 뒤 확정되지 않은 작업을 failed로 넘기고 그 수를 돌려준다', async () => {
      // given — UPDATE는 [행 배열, 영향받은 행 수]로 온다
      typeormRepository.query.mockResolvedValue([[], 2]);

      // when
      const failedCount = await repository.failExhaustedStale(
        10,
        STALE_BEFORE,
        NOW,
      );

      // then
      expect(failedCount).toBe(2);
      expect(typeormRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('attempt_count >= $4'),
        ['failed', NOW, ['pending', 'queued'], 10, STALE_BEFORE],
      );
    });

    it('대상이 없으면 0이다', async () => {
      // given
      typeormRepository.query.mockResolvedValue([[], 0]);

      // when
      const failedCount = await repository.failExhaustedStale(
        10,
        STALE_BEFORE,
        NOW,
      );

      // then
      expect(failedCount).toBe(0);
    });
  });

  describe('deleteTerminalBefore', () => {
    it('종착 상태(completed·no_candidates·failed) 전부를 상태 전이 시각 기준으로 지운다 — completed_at 만 보면 나머지 둘이 영영 남는다', async () => {
      const deleted = await repository.deleteTerminalBefore(STALE_BEFORE);

      expect(typeormRepository.delete).toHaveBeenCalledWith({
        status: In([...TERMINAL_FIRST_DRIP_STATUSES]),
        updatedAt: LessThan(STALE_BEFORE),
      });
      expect(deleted).toBe(3);
    });
  });
});
