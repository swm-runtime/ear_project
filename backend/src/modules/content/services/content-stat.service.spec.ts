import { MONTHLY_POPULAR_SAMPLE_THRESHOLD } from '../content.constant';
import { StatsPeriodType } from '../content.enum';
import { ContentStatRepository } from '../repositories/content-stat.repository';
import { ContentStatService } from './content-stat.service';

const NOW = new Date('2026-05-20T00:00:00.000Z');

describe('ContentStatService', () => {
  let service: ContentStatService;
  let repository: jest.Mocked<ContentStatRepository>;

  beforeEach(() => {
    repository = {
      sumPlayCount: jest.fn(),
      findTopContentIds: jest.fn().mockResolvedValue([]),
      saveAll: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<ContentStatRepository>;

    service = new ContentStatService(repository);
  });

  describe('isMonthlySampleSufficient', () => {
    it('직전 확정 월의 재생 합계가 기준값 미만이면 표본이 부족하다고 본다', async () => {
      // given
      repository.sumPlayCount.mockResolvedValue(
        MONTHLY_POPULAR_SAMPLE_THRESHOLD - 1,
      );

      // when
      const isSufficient = await service.isMonthlySampleSufficient(NOW);

      // then
      expect(isSufficient).toBe(false);
    });

    it('기준값과 같으면 표본이 충분하다고 본다', async () => {
      // given
      repository.sumPlayCount.mockResolvedValue(
        MONTHLY_POPULAR_SAMPLE_THRESHOLD,
      );

      // when
      const isSufficient = await service.isMonthlySampleSufficient(NOW);

      // then
      expect(isSufficient).toBe(true);
    });

    it('진행 중인 달이 아니라 직전 확정 월을 기준으로 센다', async () => {
      // given
      repository.sumPlayCount.mockResolvedValue(0);

      // when
      await service.isMonthlySampleSufficient(NOW);

      // then — 5월에는 4월 집계를 쓴다
      expect(repository.sumPlayCount).toHaveBeenCalledWith(
        StatsPeriodType.MONTH,
        '2026-04-01',
        undefined,
      );
    });
  });
});
