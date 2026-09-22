import { ALL_TIME_PERIOD_START } from '@/modules/content/content.enum';

import { ContentStatAggregationRepository } from '../repositories/content-stat-aggregation.repository';
import { ContentStatAggregationService } from './content-stat-aggregation.service';

/** 2026-09-22(화) 10:00 KST — 서비스 날짜 2026-09-22, 그 주 시작은 09-21(월) */
const NOW = new Date('2026-09-22T01:00:00.000Z');

describe('ContentStatAggregationService — 집계 배치(domain.md 5.4)', () => {
  let service: ContentStatAggregationService;
  let repository: jest.Mocked<ContentStatAggregationRepository>;

  beforeEach(() => {
    repository = {
      recompute: jest.fn().mockResolvedValue(3),
      recomputeAllFromMonths: jest
        .fn()
        .mockResolvedValue({ rowCount: 3, contentsWithGap: 0 }),
    } as unknown as jest.Mocked<ContentStatAggregationRepository>;

    service = new ContentStatAggregationService(repository);
  });

  it('주간·월간은 원천에서 재집계하고, 끝난 구간만 확정한다', async () => {
    await service.recomputeAll(NOW);

    const calls = repository.recompute.mock.calls.map(
      ([type, start, , isFinal]) => ({ type, start, isFinal }),
    );

    expect(calls).toEqual([
      { type: 'week', start: '2026-09-14', isFinal: true },
      { type: 'month', start: '2026-08-01', isFinal: true },
      { type: 'week', start: '2026-09-21', isFinal: false },
      { type: 'month', start: '2026-09-01', isFinal: false },
    ]);
  });

  it('**`all` 은 원천에서 재집계하지 않는다** — 보존 기간이 짧은 신호 계열만 잘려 완청률이 낮아진다', async () => {
    await service.recomputeAll(NOW);

    const allFromSource = repository.recompute.mock.calls.filter(
      ([type]) => type === 'all',
    );

    expect(allFromSource).toHaveLength(0);
    expect(repository.recomputeAllFromMonths).toHaveBeenCalledWith(
      ALL_TIME_PERIOD_START,
    );
  });

  it('`all` 합산은 month 재집계가 **끝난 뒤에** 돈다 — 이번 달이 합에 들어야 한다', async () => {
    const order: string[] = [];
    repository.recompute.mockImplementation((type) => {
      order.push(`recompute:${type}`);
      return Promise.resolve(1);
    });
    repository.recomputeAllFromMonths.mockImplementation(() => {
      order.push('sumMonths');
      return Promise.resolve({ rowCount: 1, contentsWithGap: 0 });
    });

    await service.recomputeAll(NOW);

    expect(order.indexOf('sumMonths')).toBe(order.length - 1);
    expect(order.lastIndexOf('recompute:month')).toBeLessThan(
      order.indexOf('sumMonths'),
    );
  });

  it('빠진 달이 있으면 경고를 남긴다 — 배치가 멈춘 달은 영영 생기지 않아 영구 오차가 된다', async () => {
    repository.recomputeAllFromMonths.mockResolvedValue({
      rowCount: 5,
      contentsWithGap: 2,
    });
    const warn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);

    await service.recomputeAll(NOW);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('missing month rows'),
      expect.objectContaining({ contents_with_gap: 2 }),
    );
  });

  it('빠진 달이 없으면 경고하지 않는다', async () => {
    const warn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);

    await service.recomputeAll(NOW);

    expect(warn).not.toHaveBeenCalled();
  });
});
