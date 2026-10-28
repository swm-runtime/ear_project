import { UserMarket } from '@/modules/user/user.enum';

import {
  INSIGHTS_COHORT_DAILY,
  INSIGHTS_COHORT_WEEKLY,
  INSIGHTS_RANK_LIMIT,
  INSIGHTS_RETENTION_DAYS,
  INSIGHTS_SUMMARY_MAX_DAYS,
} from '../admin.constant';
import { InsightsDailyRows } from '../admin.types';
import {
  AdminInsightsService,
  addDays,
  buildCohortTable,
  cohortReliableSince,
  cohortStarts,
  fillDailySeries,
  fillHourly,
  fillMarkets,
  isoWeekday,
  kstDateLabel,
  kstMidnightOf,
  pickActiveUsers,
  summarizeWeekdays,
} from './admin-insights.service';

const emptyRows: InsightsDailyRows = {
  signups: [],
  withdrawals: [],
  plays: [],
  completes: [],
  activeUsersStored: [],
  activeUsersLive: [],
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
    const series = fillDailySeries(
      since,
      now,
      {
        signups: [{ date: '2026-10-06', count: 3 }],
        withdrawals: [{ date: '2026-10-08', count: 1 }],
        plays: [{ date: '2026-10-05', plays: 4, listeners: 2, listenSec: 900 }],
        completes: [{ date: '2026-10-05', count: 1 }],
        activeUsersStored: [{ date: '2026-10-05', count: 7 }],
        activeUsersLive: [],
      },
      '2026-09-10',
    );

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
      activeUsers: 7,
    });
    expect(series[1].signups).toBe(3);
    expect(series[2]).toEqual(
      expect.objectContaining({ signups: 0, plays: 0, listenSec: 0 }),
    );
    expect(series[3].withdrawals).toBe(1);
  });

  it('kstMidnightOf — 그 시각이 속한 KST 달력일의 00:00(KST)', () => {
    expect(
      kstMidnightOf(new Date('2026-10-07T17:06:00.000Z')).toISOString(),
    ).toBe('2026-10-07T15:00:00.000Z');
    expect(
      kstMidnightOf(new Date('2026-10-07T14:59:59.000Z')).toISOString(),
    ).toBe('2026-10-06T15:00:00.000Z');
  });

  it('fillDailySeries — since 와 now 가 같은 KST 날짜면 한 칸이다', () => {
    const series = fillDailySeries(
      new Date('2026-10-08T00:00:00.000Z'),
      new Date('2026-10-08T05:00:00.000Z'),
      emptyRows,
      '2026-09-10',
    );
    expect(series).toHaveLength(1);
    expect(series[0].date).toBe('2026-10-08');
  });

  it('pickActiveUsers — 오늘은 세션 바로 세기, 지난날은 저장 표가 이기고, 표에 없으면 세션 범위 안에서만 바로 세며 그 앞은 null', () => {
    // given — 오늘 10-18, 세션이 온전한 첫 날 09-19
    const today = '2026-10-18';
    const liveFrom = '2026-09-19';
    const stored = new Map([
      ['2026-10-18', 99], // 오늘 행이 있어도(수동 실행 등) 오늘은 바로 센 값을 쓴다
      ['2026-10-17', 40], // 저장 표 — 탈퇴로 줄어든 바로 세기(35)보다 우선
      ['2026-09-01', 12], // 세션은 지워졌지만 표에 남은 날
    ]);
    const live = new Map([
      ['2026-10-18', 21],
      ['2026-10-17', 35],
      ['2026-10-16', 30],
    ]);

    // when · then
    expect(pickActiveUsers('2026-10-18', today, liveFrom, stored, live)).toBe(
      21,
    );
    expect(pickActiveUsers('2026-10-17', today, liveFrom, stored, live)).toBe(
      40,
    );
    expect(pickActiveUsers('2026-10-16', today, liveFrom, stored, live)).toBe(
      30,
    );
    // 표에도 없고 세션도 없는 최근 날 = 접속자 0명
    expect(pickActiveUsers('2026-09-19', today, liveFrom, stored, live)).toBe(
      0,
    );
    expect(pickActiveUsers('2026-09-01', today, liveFrom, stored, live)).toBe(
      12,
    );
    // 세션이 일부 지워진 날·그 앞은 표에 없으면 모른다
    expect(
      pickActiveUsers('2026-09-18', today, liveFrom, stored, live),
    ).toBeNull();
  });

  it('isoWeekday — 월 1 … 일 7', () => {
    expect(isoWeekday('2026-10-12')).toBe(1); // 월
    expect(isoWeekday('2026-10-17')).toBe(6); // 토
    expect(isoWeekday('2026-10-18')).toBe(7); // 일
  });

  it('summarizeWeekdays — 월~일 7칸, 첫날(부분)·오늘을 빼고 그 요일의 실제 날짜 수로 나누며, 접속자는 아는 날만으로 나눈다', () => {
    // given — since KST 10-03(토) 12:00, now KST 10-18(일) 12:00 → 온전한 날 10-04(일) ~ 10-17(토) 14일
    const since = new Date('2026-10-03T03:00:00.000Z');
    const now = new Date('2026-10-18T03:00:00.000Z');
    const daily = fillDailySeries(since, now, emptyRows, '2026-09-19').map(
      (d) => ({
        ...d,
        listeners:
          d.date === '2026-10-05' ? 4 : d.date === '2026-10-12' ? 6 : 1,
        // 첫 월요일(10-05)은 접속자 기록이 없다고 둔다
        activeUsers:
          d.date === '2026-10-05' ? null : d.date === '2026-10-12' ? 10 : 2,
      }),
    );
    // 첫날·오늘은 값이 커도 평균에 들어가지 않아야 한다
    daily[0].listeners = 1000;
    daily[daily.length - 1].listeners = 1000;

    // when
    const weekdays = summarizeWeekdays(daily, since, now);

    // then
    expect(weekdays.map((w) => w.label)).toEqual([
      '월',
      '화',
      '수',
      '목',
      '금',
      '토',
      '일',
    ]);
    expect(weekdays.map((w) => w.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(weekdays.map((w) => w.days)).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(weekdays[0]).toEqual({
      weekday: 1,
      label: '월',
      days: 2,
      activeDays: 1,
      avgActiveUsers: 10,
      avgListeners: 5,
    });
    expect(weekdays[5].avgListeners).toBe(1); // 토 — 첫날(10-03, 1000)은 빠졌다
    expect(weekdays[6].avgListeners).toBe(1); // 일 — 오늘(10-18, 1000)은 빠졌다
  });

  it('summarizeWeekdays — 창 안에 없는 요일은 0일 · null, since 가 KST 자정이면 첫날도 센다', () => {
    // given — since KST 10-16(금) 00:00, now KST 10-18(일) 10:00 → 금·토 이틀
    const since = new Date('2026-10-15T15:00:00.000Z');
    const now = new Date('2026-10-18T01:00:00.000Z');
    const daily = fillDailySeries(since, now, emptyRows, '2026-09-19');

    // when
    const weekdays = summarizeWeekdays(daily, since, now);

    // then
    expect(weekdays.map((w) => w.days)).toEqual([0, 0, 0, 0, 1, 1, 0]);
    expect(weekdays[0]).toEqual(
      expect.objectContaining({
        days: 0,
        activeDays: 0,
        avgActiveUsers: null,
        avgListeners: null,
      }),
    );
    expect(weekdays[4]).toEqual(
      expect.objectContaining({ avgActiveUsers: 0, avgListeners: 0 }),
    );
  });

  it('fillHourly — 0~23시 전부 채우고 없는 시간대는 0', () => {
    const hourly = fillHourly([{ hour: 7, plays: 2, listenSec: 300 }]);
    expect(hourly).toHaveLength(24);
    expect(hourly[7]).toEqual({ hour: 7, plays: 2, listenSec: 300 });
    expect(hourly[0]).toEqual({ hour: 0, plays: 0, listenSec: 0 });
    expect(hourly[23].hour).toBe(23);
  });

  it('fillMarkets — 계정이 없는 시장도 0 으로 한 칸 두고, 순서는 시장 enum 순서다', () => {
    // given — GLOBAL 행만 있다
    const global = {
      market: UserMarket.GLOBAL,
      users: 3,
      signupsInWindow: 3,
      onboardingCompleted: 2,
      active7d: 2,
      listeners7d: 1,
      listenSec: 600,
      plays: 2,
      paidActive: 0,
    };

    // when
    const filled = fillMarkets([global]);

    // then
    expect(filled.map((m) => m.market)).toEqual([
      UserMarket.KR,
      UserMarket.GLOBAL,
    ]);
    expect(filled[0]).toEqual(
      expect.objectContaining({ users: 0, listenSec: 0, plays: 0 }),
    );
    expect(filled[1]).toBe(global);
  });
});

describe('코호트 리텐션 순수 함수', () => {
  it('addDays — 달·해 경계를 넘는다', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('cohortReliableSince — 사람별 접속일 표가 백필된 날(KST) - 29일이고, 표가 비면 세션으로 셀 수 있는 첫 날이다', () => {
    // given — 백필 KST 10-18 01:00, 지금은 한 달 뒤(세션으로 셀 수 있는 첫 날 10-22)
    const backfilledAt = new Date('2026-10-17T16:00:00.000Z');

    // then — 백필 앞쪽은 세션이 지워져 있었다. 일별 접속자 표의 첫 날을 빌리지 않는다(두 마이그레이션이 다른 날 돌 수 있다)
    expect(cohortReliableSince(backfilledAt, '2026-10-22')).toBe('2026-09-19');
    expect(cohortReliableSince(null, '2026-10-22')).toBe('2026-10-22');
  });

  it('cohortStarts — 일별은 어제부터 하루씩, 주별은 이번 주 월요일부터 한 주씩(최근 먼저)', () => {
    // given — 2026-10-18 은 일요일
    const today = '2026-10-18';

    // then
    const daily = cohortStarts(today, INSIGHTS_COHORT_DAILY);
    expect(daily).toHaveLength(14);
    expect(daily[0]).toBe('2026-10-17');
    expect(daily[13]).toBe('2026-10-04');
    const weekly = cohortStarts(today, INSIGHTS_COHORT_WEEKLY);
    expect(weekly).toHaveLength(8);
    expect(weekly[0]).toBe('2026-10-12');
    expect(weekly[7]).toBe('2026-08-24');
    // 월요일 당일은 그날이 이번 주 시작이다
    expect(cohortStarts('2026-10-12', INSIGHTS_COHORT_WEEKLY)[0]).toBe(
      '2026-10-12',
    );
  });

  it('buildCohortTable(일별) — 구간이 오늘 전에 끝난 칸만 숫자이고, 빈 묶음도 0명 행으로 둔다', () => {
    // given — 오늘 10-18. 10-17 가입자의 D1 은 오늘이라 아직, 10-10 가입자의 D7 은 10-17 이라 끝났다
    const table = buildCohortTable(
      {
        sizes: [
          { start: '2026-10-17', users: 5 },
          { start: '2026-10-10', users: 4 },
        ],
        hits: [
          { start: '2026-10-10', offset: 1, returned: 3 },
          { start: '2026-10-10', offset: 7, returned: 1 },
          { start: '2026-10-17', offset: 1, returned: 2 },
        ],
      },
      ['2026-10-17', '2026-10-11', '2026-10-10'],
      INSIGHTS_COHORT_DAILY,
      '2026-10-18',
      '2026-09-19',
    );

    // then
    expect(table.span).toBe(1);
    expect(table.offsets).toEqual([1, 7]);
    expect(table.rows[0]).toEqual({
      start: '2026-10-17',
      users: 5,
      cells: [null, null],
    });
    expect(table.rows[1]).toEqual({
      start: '2026-10-11',
      users: 0,
      cells: [{ returned: 0, partial: false }, null],
    });
    expect(table.rows[2].cells).toEqual([
      { returned: 3, partial: false },
      { returned: 1, partial: false },
    ]);
  });

  it('buildCohortTable(주별) — 그 주 마지막 가입자(일요일) 기준으로 구간이 끝나야 숫자이고, 믿을 수 있는 첫 날 앞에서 시작한 칸은 partial', () => {
    // given — 오늘 10-18(일). 09-14 주 W4 = 일요일 가입자 09-20 + 28~34일 = 10-18~10-24 → 아직
    //         09-07 주 W4 = 09-13 + 28~34 = 10-11~10-17 → 끝남. W1 시작 09-14 < 09-19 → partial
    const table = buildCohortTable(
      {
        sizes: [{ start: '2026-09-07', users: 10 }],
        hits: [{ start: '2026-09-07', offset: 4, returned: 2 }],
      },
      ['2026-09-14', '2026-09-07'],
      INSIGHTS_COHORT_WEEKLY,
      '2026-10-18',
      '2026-09-19',
    );

    // then
    expect(table.rows[0].cells[3]).toBeNull();
    expect(table.rows[0].cells[2]).toEqual({ returned: 0, partial: false });
    expect(table.rows[1].cells).toEqual([
      { returned: 0, partial: true },
      { returned: 0, partial: false },
      { returned: 0, partial: false },
      { returned: 2, partial: false },
    ]);
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
    activeUsersFirstDate: jest.fn().mockResolvedValue(null),
    hourly: jest.fn().mockResolvedValue([]),
    topUsers: jest.fn().mockResolvedValue([]),
    topContents: jest.fn().mockResolvedValue([]),
    withdrawalReasons: jest.fn().mockResolvedValue([]),
    pushReactions: jest.fn().mockResolvedValue([]),
    retention: jest.fn().mockResolvedValue([]),
    boundedRetention: jest.fn().mockResolvedValue([]),
    cohortRetention: jest.fn().mockResolvedValue({ sizes: [], hits: [] }),
    activeDatesFirstRecordedAt: jest.fn().mockResolvedValue(null),
    topicSupply: jest.fn().mockResolvedValue([]),
    marketTotals: jest.fn().mockResolvedValue([]),
    regionTotals: jest.fn().mockResolvedValue([]),
  });

  it('창은 now - days 이고, 전 기간(null)·창 두 번의 청취 합계를 부르며, 순위는 상수 길이로 부른다', async () => {
    const repository = makeRepository();
    const service = new AdminInsightsService(repository as never);
    const now = new Date('2026-10-08T03:00:00.000Z');

    const summary = await service.summarize(7, now);

    expect(summary.since.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(summary.generatedAt).toBe(now);
    expect(repository.listeningTotals).toHaveBeenNthCalledWith(1, null, null);
    expect(repository.listeningTotals).toHaveBeenNthCalledWith(
      2,
      summary.since,
      null,
    );
    expect(repository.topUsers).toHaveBeenCalledWith(INSIGHTS_RANK_LIMIT, null);
    expect(repository.topContents).toHaveBeenNthCalledWith(
      1,
      INSIGHTS_RANK_LIMIT,
      null,
      'listen_sec',
      null,
    );
    // 최근 하루 인기 — 지금 - 24시간부터, 청취자 수 순
    expect(repository.topContents).toHaveBeenNthCalledWith(
      2,
      INSIGHTS_RANK_LIMIT,
      new Date('2026-10-07T03:00:00.000Z'),
      'listeners',
      null,
    );
    expect(summary.recentSince.toISOString()).toBe('2026-10-07T03:00:00.000Z');
    expect(repository.retention).toHaveBeenCalledWith(
      INSIGHTS_RETENTION_DAYS,
      now,
      null,
    );
    // 바운디드는 KST 오늘과 코호트 표와 같은 신뢰 경계로 센다
    expect(repository.boundedRetention).toHaveBeenCalledWith(
      INSIGHTS_RETENTION_DAYS,
      '2026-10-08',
      expect.any(String),
      null,
    );
    // 빈 재료라도 날짜 축(10-01 ~ 10-08 KST = 8칸)과 24시간은 채워진다
    expect(summary.daily).toHaveLength(8);
    expect(summary.hourly).toHaveLength(24);
    expect(summary.weekday).toHaveLength(7);
  });

  it('접속자는 세션이 온전한 첫 날(now - 29일)부터 바로 세고, 첫 신뢰 날짜는 저장 표의 가장 이른 날과 그 날 중 이른 쪽이다', async () => {
    // given — now KST 10-18 12:00 → 세션이 온전한 첫 날 09-19
    const now = new Date('2026-10-18T03:00:00.000Z');
    const repository = makeRepository();
    const service = new AdminInsightsService(repository as never);

    // when — 표가 비었으면 바로 세는 첫 날
    const empty = await service.summarize(14, now);

    // then
    // 일별 추이는 창 시작이 걸친 날(KST 10-04)의 자정부터 — 첫 막대도 온전한 하루다
    expect(repository.dailyRows).toHaveBeenCalledWith(
      new Date('2026-10-03T15:00:00.000Z'),
      '2026-09-19',
      null,
    );
    expect(empty.activeUsersSince).toBe('2026-09-19');

    // when — 표가 더 이른 날부터 쌓였으면 그 날
    repository.activeUsersFirstDate.mockResolvedValue('2026-08-01');
    expect((await service.summarize(14, now)).activeUsersSince).toBe(
      '2026-08-01',
    );

    // when — 표의 첫 날이 더 늦어도(백필이 빈 개발계 등) 세션으로 셀 수 있는 날부터는 믿을 수 있다
    repository.activeUsersFirstDate.mockResolvedValue('2026-10-01');
    expect((await service.summarize(14, now)).activeUsersSince).toBe(
      '2026-09-19',
    );
  });

  it('코호트는 창과 무관하게 일별 최근 14일(오늘 제외)·주별 최근 8주(오늘 포함)의 가입자를 센다', async () => {
    // given — KST 10-18(일) 12:00
    const now = new Date('2026-10-18T03:00:00.000Z');
    const repository = makeRepository();
    const service = new AdminInsightsService(repository as never);

    // when
    const summary = await service.summarize(7, now);

    // then — [from, to)
    expect(repository.cohortRetention).toHaveBeenNthCalledWith(
      1,
      '2026-10-04',
      '2026-10-18',
      1,
      [1, 7],
      null,
    );
    expect(repository.cohortRetention).toHaveBeenNthCalledWith(
      2,
      '2026-08-24',
      '2026-10-19',
      7,
      [1, 2, 3, 4],
      null,
    );
    expect(summary.retentionCohorts.daily.rows).toHaveLength(14);
    expect(summary.retentionCohorts.weekly.rows).toHaveLength(8);
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

  it('시장을 고르면 시장 비교를 뺀 모든 집계를 그 시장으로 좁히고, 고른 시장을 응답에 싣는다', async () => {
    const repository = makeRepository();
    const service = new AdminInsightsService(repository as never);
    const now = new Date('2026-10-25T03:00:00.000Z');

    const summary = await service.summarize(14, now, UserMarket.GLOBAL);

    expect(summary.market).toBe(UserMarket.GLOBAL);
    const lastArg = (mock: jest.Mock) =>
      mock.mock.calls.map((call: unknown[]) => call[call.length - 1]);
    for (const mock of [
      repository.userTotals,
      repository.listeningTotals,
      repository.dailyRows,
      repository.hourly,
      repository.topUsers,
      repository.topContents,
      repository.withdrawalReasons,
      repository.retention,
      repository.topicSupply,
      repository.cohortRetention,
    ]) {
      expect(lastArg(mock).every((m) => m === UserMarket.GLOBAL)).toBe(true);
    }
    // 시장 비교표는 늘 전 시장이다
    expect(repository.marketTotals).toHaveBeenCalledWith(summary.since, now);
    // 나라별은 글로벌을 골랐을 때만 그 시장으로 센다
    expect(repository.regionTotals).toHaveBeenCalledWith(
      summary.since,
      now,
      UserMarket.GLOBAL,
    );
  });
});
