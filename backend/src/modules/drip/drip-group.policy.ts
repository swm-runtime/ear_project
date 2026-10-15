import { User } from '@/modules/user/entities/user.entity';
import { UserMarket } from '@/modules/user/user.enum';

import { DripGroup } from './drip.enum';

/** 그룹 편성 시각(현지) — 배치 크론(`DripBatchScheduler`)이 이 값으로 만들어진다 */
export const DRIP_BATCH_LOCAL_HOUR = 5;
/** 그룹 도착 알림 시각(현지, 2026-10-14) — 알림 크론과 늦은 배치의 즉시 발송 판정이 함께 쓴다 */
export const DRIP_ARRIVAL_PUSH_LOCAL_HOUR = 7;

/** 시간대 그룹이 꺼져 있거나 판정할 수 없는 사용자의 그룹 — 종전 05:00 KST 배치 그대로다 */
export const DEFAULT_DRIP_GROUP = DripGroup.ASIA;

interface DripGroupSchedule {
  /** 크론이 도는 기준 시간대(IANA). 서머타임은 이 시간대를 따른다 */
  timeZone: string;
  /** 사용자의 현재 UTC 오프셋(분)이 이 값 이상이면 이 그룹이다 — 위에서부터 판정한다 */
  minUtcOffsetMinutes: number;
}

/**
 * 발송 그룹 정의(`global-api.md` 2.4 · 9장 미결 #3 기본값). **`DripGroup` 선언 순서대로** 오프셋 하한을 판정해 모든
 * 오프셋이 정확히 한 그룹에 든다 — asia UTC+5 이상 · europe UTC−1 이상 · americas 그 아래.
 *
 * 기준 시간대의 현지 05:00·07:00은 **같은 KST 서비스 날짜 안**에 있어야 한다(05:00 KST 경계 — 하루 1건 알림 판정과
 * `already_placed`가 서비스 날짜 기준이다). 서머타임까지 포함한 실측은 `drip-group.policy.spec.ts`가 지킨다.
 */
export const DRIP_GROUP_SCHEDULES: Readonly<
  Record<DripGroup, DripGroupSchedule>
> = {
  [DripGroup.ASIA]: { timeZone: 'Asia/Seoul', minUtcOffsetMinutes: 5 * 60 },
  [DripGroup.EUROPE]: { timeZone: 'Europe/London', minUtcOffsetMinutes: -60 },
  [DripGroup.AMERICAS]: {
    timeZone: 'America/Chicago',
    minUtcOffsetMinutes: Number.NEGATIVE_INFINITY,
  },
};

/**
 * 사용자의 발송 그룹. **GLOBAL 시장만** 시간대로 가르고, KR·시간대 없음(구 앱)·알 수 없는 시간대는 기본 그룹이다.
 * 그룹은 실행 시점마다 다시 판정한다 — 시간대를 바꾸거나 서머타임이 바뀌어 그룹이 옮겨 가면, 같은 서비스 날짜에
 * 두 번 편성되지는 않지만(`already_placed`) 이른 그룹으로 옮겨 간 날은 그 그룹 배치가 이미 지나 하루를 거른다.
 */
export function dripGroupOf(
  user: Pick<User, 'market' | 'timezone'>,
  at: Date,
): DripGroup {
  if (user.market !== UserMarket.GLOBAL || user.timezone === null) {
    return DEFAULT_DRIP_GROUP;
  }

  const offset = utcOffsetMinutes(user.timezone, at);
  if (offset === null) {
    return DEFAULT_DRIP_GROUP;
  }

  return (
    Object.values(DripGroup).find(
      (group) => offset >= DRIP_GROUP_SCHEDULES[group].minUtcOffsetMinutes,
    ) ?? DEFAULT_DRIP_GROUP
  );
}

/** 지금이 그 그룹의 오늘 알림 시각(현지 07:00) 이후인가 — 현지 자정 전까지만 참이다 */
export function isAfterArrivalPushTime(now: Date, group: DripGroup): boolean {
  return (
    localHourOf(DRIP_GROUP_SCHEDULES[group].timeZone, now) >=
    DRIP_ARRIVAL_PUSH_LOCAL_HOUR
  );
}

/**
 * `now` 뒤 그 그룹의 **다음 편성 배치 시각**(기준 시간대 현지 05:00) — 도착 알림의 보관 시한이다. 서머타임은 기준
 * 시간대를 따른다(전환은 새벽 1~3시라 05:00 자체가 비거나 겹치지 않는다).
 */
export function nextDripBatchAt(group: DripGroup, now: Date): Date {
  const { timeZone } = DRIP_GROUP_SCHEDULES[group];
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone })
    .format(now)
    .split('-')
    .map(Number);
  const today = localBatchTime(timeZone, year, month, day);

  return today.getTime() > now.getTime()
    ? today
    : localBatchTime(timeZone, year, month, day + 1);
}

/** 그 시간대 현지 날짜의 `DRIP_BATCH_LOCAL_HOUR`시 정각 순간. 날짜 넘침(`day + 1`)은 `Date.UTC`가 접는다 */
function localBatchTime(
  timeZone: string,
  year: number,
  month: number,
  day: number,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, DRIP_BATCH_LOCAL_HOUR);
  // 오프셋은 그 순간의 것이어야 한다 — 추정 시각으로 한 번 옮긴 뒤 그 지점의 오프셋으로 다시 맞춘다
  const guess =
    asUtc - (utcOffsetMinutes(timeZone, new Date(asUtc)) ?? 0) * 60_000;

  return new Date(
    asUtc - (utcOffsetMinutes(timeZone, new Date(guess)) ?? 0) * 60_000,
  );
}

/** 그 시간대의 `at` 시점 UTC 오프셋(분). 모르는 시간대면 `null` */
export function utcOffsetMinutes(timeZone: string, at: Date): number | null {
  let name: string | undefined;
  try {
    name = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
  } catch {
    return null;
  }

  // "GMT" (UTC) 또는 "GMT+05:30"
  const match = name?.match(/^GMT(?:([+-])(\d{2}):(\d{2}))?$/);
  if (!match) {
    return null;
  }
  if (match[1] === undefined) {
    return 0;
  }

  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

function localHourOf(timeZone: string, at: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(at),
  );
}
