import { SERVICE_DAY_BOUNDARY_SWITCH_ENV } from '@/common/utils/service-date.util';
import { UserMarket } from '@/modules/user/user.enum';

import { InsightsDripArrivalTimeRow } from '../admin.types';
import { dripArrivalTimeArms } from './admin-insights-drip-arrival-time.calc';
import {
  AdminInsightsService,
  serviceDayRangesBetween,
} from './admin-insights.service';

const SPECS = [
  { key: 'baseline', sendTime: '07:00', reference: false },
  { key: 'a', sendTime: '07:30', reference: false },
  { key: 'b', sendTime: '08:00', reference: false },
  { key: 'morning', sendTime: '08:00', reference: true },
] as const;

const row = (
  key: InsightsDripArrivalTimeRow['key'],
  counts: Partial<InsightsDripArrivalTimeRow> = {},
): InsightsDripArrivalTimeRow => ({
  key,
  sent: 0,
  users: 0,
  played2h: 0,
  playedSameDay: 0,
  firstSentAt: new Date('2026-10-16T22:00:00.000Z'),
  lastSentAt: new Date('2026-10-29T22:00:00.000Z'),
  ...counts,
});

describe('도착 알림 시각 실험 계산', () => {
  it('재생률은 보낸 알림을 분모로 하고, 행 순서는 기준선 · A · B · 참고 행이다', () => {
    // given — Repository 는 key 이름 순으로 준다
    const rows = [
      row('a', { sent: 50, users: 50, played2h: 10, playedSameDay: 15 }),
      row('baseline', {
        sent: 601,
        users: 548,
        played2h: 60,
        playedSameDay: 116,
      }),
    ];

    // when
    const arms = dripArrivalTimeArms(rows, [...SPECS]);

    // then
    expect(arms.map((a) => a.key)).toEqual(['baseline', 'a', 'b', 'morning']);
    expect(arms[0]).toMatchObject({
      sendTime: '07:00',
      reference: false,
      sent: 601,
      users: 548,
      playRate2h: 60 / 601,
      playRateSameDay: 116 / 601,
      firstSentAt: new Date('2026-10-16T22:00:00.000Z'),
    });
    expect(arms[1]).toMatchObject({ playRate2h: 0.2, playRateSameDay: 0.3 });
  });

  it('보낸 게 없는 묶음도 0건 행으로 나오고 비율·기간은 null 이다', () => {
    // when
    const arms = dripArrivalTimeArms([], [...SPECS]);

    // then
    expect(arms[3]).toEqual({
      key: 'morning',
      sendTime: '08:00',
      reference: true,
      sent: 0,
      users: 0,
      played2h: 0,
      playedSameDay: 0,
      playRate2h: null,
      playRateSameDay: null,
      firstSentAt: null,
      lastSentAt: null,
    });
  });
});

describe('serviceDayRangesBetween', () => {
  const original = process.env[SERVICE_DAY_BOUNDARY_SWITCH_ENV];
  afterEach(() => {
    if (original === undefined)
      delete process.env[SERVICE_DAY_BOUNDARY_SWITCH_ENV];
    else process.env[SERVICE_DAY_BOUNDARY_SWITCH_ENV] = original;
  });

  it('05:00 경계 — 걸친 서비스 날짜마다 [그날 05:00, 다음 날 05:00) 이다', () => {
    // given
    process.env[SERVICE_DAY_BOUNDARY_SWITCH_ENV] = '2026-10-07T05:00:00+09:00';

    // when — KST 10-28 06:00 ~ 10-30 04:00 = 서비스 날짜 10-28 · 10-29
    const ranges = serviceDayRangesBetween(
      new Date('2026-10-27T21:00:00.000Z'),
      new Date('2026-10-29T19:00:00.000Z'),
    );

    // then
    expect(
      ranges.map((r) => [r.start.toISOString(), r.end.toISOString()]),
    ).toEqual([
      ['2026-10-27T20:00:00.000Z', '2026-10-28T20:00:00.000Z'],
      ['2026-10-28T20:00:00.000Z', '2026-10-29T20:00:00.000Z'],
    ]);
  });

  it('전환일은 25시간이다(04:00 시작 · 다음 날 05:00 끝)', () => {
    // given
    process.env[SERVICE_DAY_BOUNDARY_SWITCH_ENV] = '2026-10-08T05:00:00+09:00';

    // when — KST 10-08 12:00 하나(전환일)
    const ranges = serviceDayRangesBetween(
      new Date('2026-10-08T03:00:00.000Z'),
      new Date('2026-10-08T03:00:00.000Z'),
    );

    // then
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start.toISOString()).toBe('2026-10-07T19:00:00.000Z');
    expect(ranges[0].end.toISOString()).toBe('2026-10-08T20:00:00.000Z');
  });
});

describe('AdminInsightsService.dripArrivalTime', () => {
  it('보내는 쪽 종류 문자열로 부르고, 창은 now - days(상한 90) 이다', async () => {
    // given
    const repository = {
      dripArrivalTimeRows: jest
        .fn()
        .mockResolvedValue([row('b', { sent: 3, played2h: 1 })]),
    };
    const service = new AdminInsightsService(repository as never);
    const now = new Date('2026-10-30T03:00:00.000Z');

    // when
    const result = await service.dripArrivalTime(now, 500, UserMarket.KR);

    // then
    expect(result.days).toBe(90);
    expect(result.since.toISOString()).toBe('2026-08-01T03:00:00.000Z');
    const [since, options] = repository.dripArrivalTimeRows.mock.calls[0] as [
      Date,
      {
        market: UserMarket | null;
        types: Record<string, string>;
        serviceDays: { start: Date; end: Date }[];
      },
    ];
    expect(since).toBe(result.since);
    expect(options.market).toBe(UserMarket.KR);
    expect(options.types).toEqual({
      baseline: 'drip_arrival',
      a: 'drip_arrival.a',
      b: 'drip_arrival.b',
      morningPrefix: 'retention.morning.',
      morningHoldout: 'retention.morning.holdout',
    });
    expect(options.serviceDays.length).toBeGreaterThanOrEqual(90);
    expect(options.serviceDays[0].start.getTime()).toBeLessThanOrEqual(
      since.getTime(),
    );
    expect(
      options.serviceDays[options.serviceDays.length - 1].end.getTime(),
    ).toBeGreaterThan(now.getTime());
    expect(result.arms.map((a) => [a.key, a.sendTime, a.reference])).toEqual([
      ['baseline', '07:00', false],
      ['a', '07:30', false],
      ['b', '08:00', false],
      ['morning', '08:00', true],
      ['morning_holdout', '08:00', true],
    ]);
    expect(result.arms[2].playRate2h).toBe(1 / 3);
  });
});
