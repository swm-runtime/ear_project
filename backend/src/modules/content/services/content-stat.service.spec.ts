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

  describe('findMonthlyPopularContentIds', () => {
    it('진행 중인 달이 아니라 직전 확정 월을 기준으로 조회한다', async () => {
      // given — 진행 중 구간을 쓰면 월초에 표본이 부족해 순위가 무너진다(domain.md 5.4)

      // when
      await service.findMonthlyPopularContentIds(NOW, 10);

      // then — 2026-05-20 조회는 4월 집계를 본다
      expect(repository.findTopContentIds).toHaveBeenCalledWith(
        StatsPeriodType.MONTH,
        '2026-04-01',
        10,
        undefined,
      );
    });

    it('집계가 없으면 빈 목록이다 — 폴백을 만들지 않는다', async () => {
      // given — 랜덤 배치는 폐기됐다(README 결정 12). 순위가 비면 호출부가 원래
      // 후보 순서를 유지한다
      repository.findTopContentIds.mockResolvedValue([]);

      // when
      const ids = await service.findMonthlyPopularContentIds(NOW, 10);

      // then
      expect(ids).toEqual([]);
    });
  });
});
