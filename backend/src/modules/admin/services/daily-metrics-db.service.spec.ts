import { DailyMetricsDbService } from './daily-metrics-db.service';

describe('DailyMetricsDbService', () => {
  it('서비스 날짜(04시 경계 — 전환 전) 하루 범위로 가입을 센다', async () => {
    const query = jest.fn().mockResolvedValue([{ sign_ups: 3 }]);
    const svc = new DailyMetricsDbService({ query } as never);

    await expect(svc.fetchDaily('2026-09-28')).resolves.toEqual({
      signUps: 3,
    });

    const [sql, params] = query.mock.calls[0] as [string, Date[]];
    expect(sql).toContain('from users');
    // 2026-09-28 서비스 날짜 = 09-28 04:00 KST ~ 09-29 04:00 KST
    expect(params[0].toISOString()).toBe('2026-09-27T19:00:00.000Z');
    expect(params[1].toISOString()).toBe('2026-09-28T19:00:00.000Z');
  });

  it('행이 없으면 0 — 던지지 않는다', async () => {
    const svc = new DailyMetricsDbService({
      query: jest.fn().mockResolvedValue([]),
    } as never);
    await expect(svc.fetchDaily('2026-09-28')).resolves.toEqual({
      signUps: 0,
    });
  });
});
