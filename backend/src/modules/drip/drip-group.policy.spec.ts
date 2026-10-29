import { toServiceDate } from '@/common/utils/service-date.util';
import { UserMarket } from '@/modules/user/user.enum';

import {
  DRIP_ARRIVAL_PUSH_LOCAL_HOUR,
  DRIP_ARRIVAL_SLOT_TIMES,
  DRIP_BATCH_LOCAL_HOUR,
  DripArrivalSlot,
  dripArrivalBucketOf,
  dripArrivalSlotOf,
  dripArrivalVariantOf,
  isArrivalSlotActive,
  DRIP_GROUP_SCHEDULES,
  dripGroupOf,
  isAfterArrivalPushTime,
  nextDripBatchAt,
  utcOffsetMinutes,
} from './drip-group.policy';
import { DripGroup } from './drip.enum';

/** 2026-01-15 12:00 UTC — 북반구 겨울(서머타임 없음) */
const WINTER = new Date('2026-01-15T12:00:00.000Z');
/** 2026-07-15 12:00 UTC — 북반구 여름(서머타임) */
const SUMMER = new Date('2026-07-15T12:00:00.000Z');

describe('dripGroupOf — 발송 그룹 판정', () => {
  const global = (timezone: string | null) => ({
    market: UserMarket.GLOBAL,
    timezone,
  });

  it.each([
    ['Asia/Tokyo', DripGroup.ASIA], // +9
    ['Asia/Seoul', DripGroup.ASIA], // GLOBAL 인데 한국 시간대
    // 1차 공개 동남아·홍콩(2026-10-26) — 싱가포르 기준 그룹
    ['Asia/Singapore', DripGroup.SOUTHEAST_ASIA], // +8
    ['Asia/Kuala_Lumpur', DripGroup.SOUTHEAST_ASIA],
    ['Asia/Manila', DripGroup.SOUTHEAST_ASIA],
    ['Asia/Hong_Kong', DripGroup.SOUTHEAST_ASIA],
    ['Asia/Bangkok', DripGroup.SOUTHEAST_ASIA], // +7
    ['Asia/Jakarta', DripGroup.SOUTHEAST_ASIA], // +7(서부)
    ['Asia/Makassar', DripGroup.SOUTHEAST_ASIA], // +8(인도네시아 중부)
    ['Asia/Jayapura', DripGroup.ASIA], // +9(인도네시아 동부) — 한국과 같은 시각
    ['Asia/Kolkata', DripGroup.SOUTHEAST_ASIA], // +5:30 — 하한 +5
    ['Pacific/Auckland', DripGroup.ASIA], // +13 — 그룹 하한만 보므로 동쪽 끝도 asia
    ['Asia/Dubai', DripGroup.EUROPE], // +4
    ['Europe/London', DripGroup.EUROPE], // 0
    ['Atlantic/Azores', DripGroup.EUROPE], // −1
    ['America/Noronha', DripGroup.AMERICAS], // −2
    ['America/New_York', DripGroup.AMERICAS],
    ['Pacific/Honolulu', DripGroup.AMERICAS], // −10
    ['UTC', DripGroup.EUROPE],
  ])('GLOBAL %s → %s', (timezone, expected) => {
    expect(dripGroupOf(global(timezone), WINTER)).toBe(expected);
  });

  it('KR 시장은 시간대와 무관하게 기본 그룹이다', () => {
    // given
    const user = { market: UserMarket.KR, timezone: 'America/New_York' };

    // when / then
    expect(dripGroupOf(user, WINTER)).toBe(DripGroup.ASIA);
  });

  it.each([null, 'Mars/Olympus'])(
    'GLOBAL 이어도 시간대가 %s 이면 기본 그룹이다(없음·모르는 값)',
    (timezone) => {
      expect(dripGroupOf(global(timezone), WINTER)).toBe(DripGroup.ASIA);
    },
  );
});

describe('utcOffsetMinutes', () => {
  it.each([
    ['Asia/Seoul', WINTER, 540],
    ['Asia/Kolkata', WINTER, 330],
    ['UTC', WINTER, 0],
    ['America/New_York', WINTER, -300],
    ['America/New_York', SUMMER, -240],
  ])('%s @ %s → %s', (timeZone, at, expected) => {
    expect(utcOffsetMinutes(timeZone, at)).toBe(expected);
  });
});

describe('isAfterArrivalPushTime — 그룹 현지 07:00', () => {
  it.each([
    ['2026-08-26T20:00:00.000Z', DripGroup.ASIA, false], // 05:00 KST
    ['2026-08-26T21:59:59.000Z', DripGroup.ASIA, false], // 06:59:59 KST
    ['2026-08-26T22:00:00.000Z', DripGroup.ASIA, true], // 07:00 KST
    ['2026-08-27T14:00:00.000Z', DripGroup.ASIA, true], // 23:00 KST
    ['2026-08-27T05:59:00.000Z', DripGroup.EUROPE, false], // 06:59 BST
    ['2026-08-27T06:00:00.000Z', DripGroup.EUROPE, true], // 07:00 BST
    ['2026-01-15T12:59:00.000Z', DripGroup.AMERICAS, false], // 06:59 CST
    ['2026-01-15T13:00:00.000Z', DripGroup.AMERICAS, true], // 07:00 CST
  ])('%s %s → %s', (iso, group, expected) => {
    expect(isAfterArrivalPushTime(new Date(iso), group)).toBe(expected);
  });
});

/**
 * 그룹 시각이 KST 서비스 날짜를 넘으면 하루 1건 알림 판정과 `already_placed`가 어긋난다(`global-api.md` 2.4) —
 * 기준 시간대를 바꿀 때 이 테스트가 막는다. 서머타임 양쪽에서 본다.
 */
describe('DRIP_GROUP_SCHEDULES — 현지 05:00 편성과 07:00 알림이 같은 KST 서비스 날짜 안에 있다', () => {
  const localDate = (timeZone: string, at: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);

  /** 그 시간대의 현지 날짜 `date`의 `hour`시 정각 순간 */
  function localTime(timeZone: string, date: string, hour: number): Date {
    const guess = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
    const offset = utcOffsetMinutes(timeZone, guess) as number;
    return new Date(guess.getTime() - offset * 60 * 1000);
  }

  it.each(
    Object.values(DripGroup).flatMap((group) =>
      ['2026-01-15', '2026-07-15'].map((date) => [group, date] as const),
    ),
  )('%s · %s', (group, date) => {
    const { timeZone } = DRIP_GROUP_SCHEDULES[group];
    const batchAt = localTime(timeZone, date, DRIP_BATCH_LOCAL_HOUR);
    const pushAt = localTime(timeZone, date, DRIP_ARRIVAL_PUSH_LOCAL_HOUR);

    expect(localDate(timeZone, batchAt)).toBe(date);
    expect(toServiceDate(batchAt)).toBe(date);
    expect(toServiceDate(pushAt)).toBe(date);
    // 시각 A/B의 가장 늦은 시각(08:00)도 같은 서비스 날짜다(KAN-289) — 하루 1건 판정이 서비스 날짜 기준이다
    const latestPushAt = localTime(
      timeZone,
      date,
      DRIP_ARRIVAL_SLOT_TIMES[DripArrivalSlot.H0800].hour,
    );
    expect(toServiceDate(latestPushAt)).toBe(date);
  });
});

describe('nextDripBatchAt — 그룹의 다음 편성 배치(알림 보관 시한)', () => {
  it.each([
    // asia — 종전 "다음 05:00 KST"와 같다
    ['2026-10-14T22:00:00.000Z', DripGroup.ASIA, '2026-10-15T20:00:00.000Z'], // 07:00 KST → 다음 날 05:00 KST
    ['2026-10-14T19:30:00.000Z', DripGroup.ASIA, '2026-10-14T20:00:00.000Z'], // 04:30 KST → 같은 날 05:00 KST
    // americas — 시카고 07:00(KST 21~22시)이면 다음 날 시카고 05:00. 종전엔 다음 05:00 KST(7~8시간 뒤)였다
    [
      '2026-01-15T13:00:00.000Z',
      DripGroup.AMERICAS,
      '2026-01-16T11:00:00.000Z',
    ], // CST(UTC−6)
    [
      '2026-07-15T12:00:00.000Z',
      DripGroup.AMERICAS,
      '2026-07-16T10:00:00.000Z',
    ], // CDT(UTC−5)
    // europe — 런던 07:00 → 다음 날 런던 05:00
    ['2026-07-15T06:00:00.000Z', DripGroup.EUROPE, '2026-07-16T04:00:00.000Z'], // BST(UTC+1)
    // 서머타임 시작 주말(미국 2026-03-08) — 전날 07:00 CST 발송, 다음 배치는 05:00 CDT
    [
      '2026-03-07T13:00:00.000Z',
      DripGroup.AMERICAS,
      '2026-03-08T10:00:00.000Z',
    ],
  ])('%s %s → %s', (now, group, expected) => {
    expect(nextDripBatchAt(group, new Date(now)).toISOString()).toBe(expected);
  });
});

describe('도착 알림 시각 A/B(KAN-289)', () => {
  const ids = Array.from({ length: 2000 }, (_, i) => `user-${i}`);

  it('스위치가 꺼져 있으면 전원 07:00 이고 기록에 그룹 표기가 없다', () => {
    for (const id of ids.slice(0, 50)) {
      expect(dripArrivalSlotOf(id, false)).toBe(DripArrivalSlot.H0700);
    }
    expect(isArrivalSlotActive(DripArrivalSlot.H0700, false)).toBe(true);
    expect(isArrivalSlotActive(DripArrivalSlot.H0730, false)).toBe(false);
    expect(isArrivalSlotActive(DripArrivalSlot.H0800, false)).toBe(false);
    expect(dripArrivalVariantOf(DripArrivalSlot.H0700, false)).toBeNull();
  });

  it('스위치가 켜져 있으면 A 그룹은 07:30 · B 그룹은 08:00 이고 07:00 은 쉰다', () => {
    for (const id of ids.slice(0, 50)) {
      expect(dripArrivalSlotOf(id, true)).toBe(
        dripArrivalBucketOf(id) === 0
          ? DripArrivalSlot.H0730
          : DripArrivalSlot.H0800,
      );
    }
    expect(isArrivalSlotActive(DripArrivalSlot.H0700, true)).toBe(false);
    expect(isArrivalSlotActive(DripArrivalSlot.H0730, true)).toBe(true);
    expect(isArrivalSlotActive(DripArrivalSlot.H0800, true)).toBe(true);
    expect(dripArrivalVariantOf(DripArrivalSlot.H0730, true)).toBe('a');
    expect(dripArrivalVariantOf(DripArrivalSlot.H0800, true)).toBe('b');
  });

  it('같은 사용자는 늘 같은 그룹이고, 전체는 거의 반반이다', () => {
    const inA = ids.filter((id) => dripArrivalBucketOf(id) === 0).length;

    expect(ids.map(dripArrivalBucketOf)).toEqual(ids.map(dripArrivalBucketOf));
    expect(inA / ids.length).toBeGreaterThan(0.45);
    expect(inA / ids.length).toBeLessThan(0.55);
  });

  it('isAfterArrivalPushTime 은 시각마다 분 단위로 판정한다', () => {
    /** 2026-08-27 07:29 · 07:30 · 07:59 · 08:00 KST */
    const kst = (hhmm: string) => new Date(`2026-08-27T${hhmm}:00+09:00`);

    expect(
      isAfterArrivalPushTime(
        kst('07:29'),
        DripGroup.ASIA,
        DripArrivalSlot.H0730,
      ),
    ).toBe(false);
    expect(
      isAfterArrivalPushTime(
        kst('07:30'),
        DripGroup.ASIA,
        DripArrivalSlot.H0730,
      ),
    ).toBe(true);
    expect(
      isAfterArrivalPushTime(
        kst('07:59'),
        DripGroup.ASIA,
        DripArrivalSlot.H0800,
      ),
    ).toBe(false);
    expect(
      isAfterArrivalPushTime(
        kst('08:00'),
        DripGroup.ASIA,
        DripArrivalSlot.H0800,
      ),
    ).toBe(true);
    // 기본은 종전 07:00
    expect(isAfterArrivalPushTime(kst('07:00'), DripGroup.ASIA)).toBe(true);
    expect(isAfterArrivalPushTime(kst('06:59'), DripGroup.ASIA)).toBe(false);
  });
});
