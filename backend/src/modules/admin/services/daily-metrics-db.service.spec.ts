import { DailyMetricsDbService } from './daily-metrics-db.service';

describe('DailyMetricsDbService', () => {
  it('KST 달력일(00시) 하루 범위로 가입·탈퇴·청취를 세고, 가입자·청취를 시장별로 나눈다 — GA4 줄과 같은 하루', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { market: 'kr', sign_ups: 3, total_users: 350 },
        { market: 'global', sign_ups: 0, total_users: 1 },
      ])
      .mockResolvedValueOnce([
        { market: 'kr', reason_code: 'price', count: 2 },
        { market: 'global', reason_code: null, count: 1 },
      ])
      .mockResolvedValueOnce([
        { market: 'kr', listeners: 30, plays: 40, listen_sec: 45000 },
      ]);
    const svc = new DailyMetricsDbService({ query } as never);

    await expect(svc.fetchDaily('2026-09-28')).resolves.toEqual({
      signUps: 3,
      totalUsers: 351,
      withdrawals: [
        { market: 'kr', reasonCode: 'price', count: 2 },
        { market: 'global', reasonCode: null, count: 1 },
      ],
      // 재생이 없던 시장(GLOBAL)도 0 으로 한 칸
      markets: [
        {
          market: 'kr',
          totalUsers: 350,
          signUps: 3,
          listeners: 30,
          plays: 40,
          listenSec: 45000,
        },
        {
          market: 'global',
          totalUsers: 1,
          signUps: 0,
          listeners: 0,
          plays: 0,
          listenSec: 0,
        },
      ],
    });

    const [usersSql, usersParams] = query.mock.calls[0] as [string, Date[]];
    const [logsSql, logsParams] = query.mock.calls[1] as [string, Date[]];
    const [playsSql, playsParams] = query.mock.calls[2] as [string, Date[]];
    expect(usersSql).toContain('from users');
    expect(usersSql).toContain('group by market');
    expect(logsSql).toContain('from withdrawal_logs');
    expect(logsSql).toContain('group by market, reason_code');
    // 청취는 재생을 시작한 시각으로 같은 범위를 자른다
    expect(playsSql).toContain('from play_records');
    expect(playsSql).toContain('played_at');
    // 2026-09-28 = 09-28 00:00 KST ~ 09-29 00:00 KST — 가입·탈퇴·청취가 같은 범위다
    expect(usersParams[0].toISOString()).toBe('2026-09-27T15:00:00.000Z');
    expect(usersParams[1].toISOString()).toBe('2026-09-28T15:00:00.000Z');
    expect(logsParams).toEqual(usersParams);
    expect(playsParams).toEqual(usersParams);
  });

  it('행이 없으면 0 — 던지지 않는다', async () => {
    const svc = new DailyMetricsDbService({
      query: jest.fn().mockResolvedValue([]),
    } as never);
    await expect(svc.fetchDaily('2026-09-28')).resolves.toEqual({
      signUps: 0,
      totalUsers: 0,
      withdrawals: [],
      markets: [
        {
          market: 'kr',
          totalUsers: 0,
          signUps: 0,
          listeners: 0,
          plays: 0,
          listenSec: 0,
        },
        {
          market: 'global',
          totalUsers: 0,
          signUps: 0,
          listeners: 0,
          plays: 0,
          listenSec: 0,
        },
      ],
    });
  });
});
