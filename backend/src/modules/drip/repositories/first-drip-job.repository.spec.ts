import { Repository } from 'typeorm';

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
});
