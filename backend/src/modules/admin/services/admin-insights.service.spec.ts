import {
  INSIGHTS_RANK_LIMIT,
  INSIGHTS_RETENTION_DAYS,
  INSIGHTS_SUMMARY_MAX_DAYS,
} from '../admin.constant';
import { InsightsDailyRows } from '../admin.types';
import {
  AdminInsightsService,
  fillDailySeries,
  fillHourly,
  kstDateLabel,
} from './admin-insights.service';

const emptyRows: InsightsDailyRows = {
  signups: [],
  withdrawals: [],
  plays: [],
  completes: [],
};

describe('AdminInsightsService 순수 함수', () => {
  it('kstDateLabel — UTC 자정 직전은 KST 로는 다음 날이다', () => {
    expect(kstDateLabel(new Date('2026-10-07T15:30:00.000Z'))).toBe(
      '2026-10-08',
    );
    expect(kstDateLabel(new Date('2026-10-07T14:59:59.000Z'))).toBe(
      '2026-10-07',
    );
  });

  it('fillDailySeries — since 의 KST 날짜부터 now 의 KST 날짜까지 하루도 빠지지 않고, 기록 없는 날은 0 이다', () => {
    const since = new Date('2026-10-05T01:00:00.000Z'); // KST 10-05 10:00
    const now = new Date('2026-10-07T16:00:00.000Z'); // KST 10-08 01:00
    const series = fillDailySeries(since, now, {
      signups: [{ date: '2026-10-06', count: 3 }],
      withdrawals: [{ date: '2026-10-08', count: 1 }],
      plays: [{ date: '2026-10-05', plays: 4, listeners: 2, listenSec: 900 }],
      completes: [{ date: '2026-10-05', count: 1 }],
    });

    expect(series.map((d) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
    expect(series[0]).toEqual({
      date: '2026-10-05',
      signups: 0,
      withdrawals: 0,
      plays: 4,
      listeners: 2,
      listenSec: 900,
      completes: 1,
    });
    expect(series[1].signups).toBe(3);
    expect(series[2]).toEqual(
      expect.objectContaining({ signups: 0, plays: 0, listenSec: 0 }),
    );
    expect(series[3].withdrawals).toBe(1);
  });

  it('fillDailySeries — since 와 now 가 같은 KST 날짜면 한 칸이다', () => {
    const series = fillDailySeries(
      new Date('2026-10-08T00:00:00.000Z'),
      new Date('2026-10-08T05:00:00.000Z'),
      emptyRows,
    );
    expect(series).toHaveLength(1);
    expect(series[0].date).toBe('2026-10-08');
  });

  it('fillHourly — 0~23시 전부 채우고 없는 시간대는 0', () => {
    const hourly = fillHourly([{ hour: 7, plays: 2, listenSec: 300 }]);
    expect(hourly).toHaveLength(24);
    expect(hourly[7]).toEqual({ hour: 7, plays: 2, listenSec: 300 });
    expect(hourly[0]).toEqual({ hour: 0, plays: 0, listenSec: 0 });
    expect(hourly[23].hour).toBe(23);
  });
});

describe('AdminInsightsService.summarize', () => {
  const makeRepository = () => ({
    userTotals: jest.fn().mockResolvedValue({ current: 1 }),
    listeningTotals: jest.fn().mockResolvedValue({
      listenSec: 0,
      plays: 0,
      completes: 0,
      listeners: 0,
      saves: 0,
    }),
    dailyRows: jest.fn().mockResolvedValue(emptyRows),
    hourly: jest.fn().mockResolvedValue([]),
    topUsers: jest.fn().mockResolvedValue([]),
    topContents: jest.fn().mockResolvedValue([]),
    withdrawalReasons: jest.fn().mockResolvedValue([]),
    retention: jest.fn().mockResolvedValue([]),
  });

  it('창은 now - days 이고, 전 기간(null)·창 두 번의 청취 합계를 부르며, 순위는 상수 길이로 부른다', async () => {
    const repository = makeRepository();
    const service = new AdminInsightsService(repository as never);
    const now = new Date('2026-10-08T03:00:00.000Z');

    const summary = await service.summarize(7, now);

    expect(summary.since.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(summary.generatedAt).toBe(now);
    expect(repository.listeningTotals).toHaveBeenNthCalledWith(1, null);
    expect(repository.listeningTotals).toHaveBeenNthCalledWith(
      2,
      summary.since,
    );
    expect(repository.topUsers).toHaveBeenCalledWith(INSIGHTS_RANK_LIMIT);
    expect(repository.topContents).toHaveBeenCalledWith(INSIGHTS_RANK_LIMIT);
    expect(repository.retention).toHaveBeenCalledWith(
      INSIGHTS_RETENTION_DAYS,
      now,
    );
    // 빈 재료라도 날짜 축(10-01 ~ 10-08 KST = 8칸)과 24시간은 채워진다
    expect(summary.daily).toHaveLength(8);
    expect(summary.hourly).toHaveLength(24);
  });

  it('days 가 상한을 넘으면 상한으로 자른다 — DTO 가 막지만 Service 혼자서도 안전해야 한다', async () => {
    const repository = makeRepository();
    const service = new AdminInsightsService(repository as never);
    const now = new Date('2026-10-08T03:00:00.000Z');

    const summary = await service.summarize(10_000, now);

    expect((now.getTime() - summary.since.getTime()) / 86_400_000).toBe(
      INSIGHTS_SUMMARY_MAX_DAYS,
    );
  });
});
