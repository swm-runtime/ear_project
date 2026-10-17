import { DailyMetricsDbService } from './daily-metrics-db.service';

describe('DailyMetricsDbService', () => {
  it('서비스 날짜(04시 경계 — 전환 전) 하루 범위로 가입·탈퇴를 세고, 가입자·청취를 시장별로 나눈다', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { market: 'kr', sign_ups: 3, total_users: 350 },
        { market: 'global', sign_ups: 0, total_users: 1 },
      ])
      .mockResolvedValueOnce([
        { reason_code: 'price', count: 2 },
        { reason_code: null, count: 1 },
      ])
      .mockResolvedValueOnce([
        { market: 'kr', listeners: 30, plays: 40, listen_sec: 45000 },
      ]);
    const svc = new DailyMetricsDbService({ query } as never);

    await expect(svc.fetchDaily('2026-09-28')).resolves.toEqual({
      signUps: 3,
      totalUsers: 351,
      withdrawals: [
        { reasonCode: 'price', count: 2 },
        { reasonCode: null, count: 1 },
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
    const [playsSql, playsParams] = query.mock.calls[2] as [string, string[]];
    expect(usersSql).toContain('from users');
    expect(usersSql).toContain('group by market');
    expect(logsSql).toContain('from withdrawal_logs');
    // 청취는 재생 행의 서비스 날짜 라벨로 자른다
    expect(playsSql).toContain('from play_records');
    expect(playsParams).toEqual(['2026-09-28']);
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
