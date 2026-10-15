import { DailyMetricsDbService } from './daily-metrics-db.service';

describe('DailyMetricsDbService', () => {
  it('서비스 날짜(04시 경계 — 전환 전) 하루 범위로 가입·탈퇴를 세고, 전체 가입자 수를 함께 센다', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ sign_ups: 3, total_users: 351 }])
      .mockResolvedValueOnce([
        { reason_code: 'price', count: 2 },
        { reason_code: null, count: 1 },
      ]);
    const svc = new DailyMetricsDbService({ query } as never);

    await expect(svc.fetchDaily('2026-09-28')).resolves.toEqual({
      signUps: 3,
      totalUsers: 351,
      withdrawals: [
        { reasonCode: 'price', count: 2 },
        { reasonCode: null, count: 1 },
      ],
    });

    const [usersSql, usersParams] = query.mock.calls[0] as [string, Date[]];
    const [logsSql, logsParams] = query.mock.calls[1] as [string, Date[]];
    expect(usersSql).toContain('from users');
    expect(logsSql).toContain('from withdrawal_logs');
    // 2026-09-28 서비스 날짜 = 09-28 04:00 KST ~ 09-29 04:00 KST — 가입과 탈퇴가 같은 범위다
    expect(usersParams[0].toISOString()).toBe('2026-09-27T19:00:00.000Z');
    expect(usersParams[1].toISOString()).toBe('2026-09-28T19:00:00.000Z');
    expect(logsParams).toEqual(usersParams);
  });

  it('행이 없으면 0 — 던지지 않는다', async () => {
    const svc = new DailyMetricsDbService({
      query: jest.fn().mockResolvedValue([]),
    } as never);
    await expect(svc.fetchDaily('2026-09-28')).resolves.toEqual({
      signUps: 0,
      totalUsers: 0,
      withdrawals: [],
    });
  });
});
