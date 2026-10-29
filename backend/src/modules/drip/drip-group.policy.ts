import {
  bucketLabel,
  experimentBucket,
} from '@/common/utils/experiment-bucket.util';
import { User } from '@/modules/user/entities/user.entity';
import { UserMarket } from '@/modules/user/user.enum';

import { DripGroup } from './drip.enum';

/** 그룹 편성 시각(현지) — 배치 크론(`DripBatchScheduler`)이 이 값으로 만들어진다 */
export const DRIP_BATCH_LOCAL_HOUR = 5;
/** 그룹 도착 알림 시각(현지, 2026-10-14) — 알림 크론과 늦은 배치의 즉시 발송 판정이 함께 쓴다. A/B 실험이 꺼져 있을 때의 시각 */
export const DRIP_ARRIVAL_PUSH_LOCAL_HOUR = 7;

/**
 * 도착 알림 발송 시각(그룹 현지) — 크론 하나가 시각 하나다(KAN-289 — 2026-10-29). A/B 스위치(`DRIP_ARRIVAL_AB_ENABLED`)가
 * 꺼져 있으면 07:00 하나만 보내고(종전 그대로), 켜져 있으면 A 그룹 07:30 · B 그룹 08:00이다. 08:00은 아침 알림(KAN-288)의 시각이기도 하다.
 */
export enum DripArrivalSlot {
  /** 07:00 — 스위치 꺼짐: 전원 */
  H0700 = '07:00',
  /** 07:30 — 스위치 켜짐: A 그룹 */
  H0730 = '07:30',
  /** 08:00 — 스위치 켜짐: B 그룹 */
  H0800 = '08:00',
}

export const DRIP_ARRIVAL_SLOT_TIMES: Readonly<
  Record<DripArrivalSlot, { hour: number; minute: number }>
> = {
  [DripArrivalSlot.H0700]: { hour: DRIP_ARRIVAL_PUSH_LOCAL_HOUR, minute: 0 },
  [DripArrivalSlot.H0730]: { hour: 7, minute: 30 },
  [DripArrivalSlot.H0800]: { hour: 8, minute: 0 },
};

/** 실험 키 — 다른 실험과 그룹이 독립이게(`experimentBucket`). 바꾸면 전원의 그룹이 다시 섞인다 */
export const DRIP_ARRIVAL_AB_EXPERIMENT_KEY = 'drip_arrival_time';

/** A/B 켜짐일 때 그룹(0 = A, 1 = B)마다 받는 시각 */
const DRIP_ARRIVAL_AB_SLOTS: readonly DripArrivalSlot[] = [
  DripArrivalSlot.H0730,
  DripArrivalSlot.H0800,
];

/** 사용자의 실험 그룹(0 = A, 1 = B) — 사용자 id 해시라 매일 같다 */
export function dripArrivalBucketOf(userId: string): number {
  return experimentBucket(
    userId,
    DRIP_ARRIVAL_AB_EXPERIMENT_KEY,
    DRIP_ARRIVAL_AB_SLOTS.length,
  );
}

/** 사용자가 도착 알림을 받는 시각 */
export function dripArrivalSlotOf(
  userId: string,
  abEnabled: boolean,
): DripArrivalSlot {
  return abEnabled
    ? DRIP_ARRIVAL_AB_SLOTS[dripArrivalBucketOf(userId)]
    : DripArrivalSlot.H0700;
}

/** 이 시각에 도착 알림을 보내는가 — 꺼짐이면 07:00만, 켜짐이면 07:30·08:00만 */
export function isArrivalSlotActive(
  slot: DripArrivalSlot,
  abEnabled: boolean,
): boolean {
  return abEnabled
    ? DRIP_ARRIVAL_AB_SLOTS.includes(slot)
    : slot === DripArrivalSlot.H0700;
}

/**
 * `notification_logs.type`에 함께 남길 그룹 표기 — 켜짐이면 `a`·`b`(→ `drip_arrival.a`), 꺼짐이면 null(→ `drip_arrival`, 종전 그대로).
 * 앱이 읽는 푸시 `data.type`은 `drip_arrival` 그대로다 — 기록에만 남긴다
 */
export function dripArrivalVariantOf(
  slot: DripArrivalSlot,
  abEnabled: boolean,
): string | null {
  const bucket = DRIP_ARRIVAL_AB_SLOTS.indexOf(slot);

  return abEnabled && bucket >= 0 ? bucketLabel(bucket) : null;
}

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
 * 오프셋이 정확히 한 그룹에 든다 — asia UTC+9 이상 · southeast_asia UTC+5 이상 · europe UTC−1 이상 · americas 그 아래.
 *
 * 기준 시간대의 현지 05:00~08:00(편성 · 도착 알림 07:00 · 시각 A/B 07:30·08:00)은 **같은 KST 서비스 날짜 안**에 있어야 한다(05:00 KST 경계 — 하루 1건 알림 판정과
 * `already_placed`가 서비스 날짜 기준이다). 서머타임까지 포함한 실측은 `drip-group.policy.spec.ts`가 지킨다.
 */
export const DRIP_GROUP_SCHEDULES: Readonly<
  Record<DripGroup, DripGroupSchedule>
> = {
  [DripGroup.ASIA]: { timeZone: 'Asia/Seoul', minUtcOffsetMinutes: 9 * 60 },
  /**
   * 1차 공개 7개국 중 한국을 뺀 6개국(싱가포르·말레이시아·필리핀·홍콩 UTC+8 · 태국·인도네시아 서부 UTC+7)이 여기다
   * (2026-10-26). 기준을 싱가포르(+8)로 두어 +8 나라는 현지 07:00, +7 나라는 06:00에 알림을 받는다 — 그룹 하나로 묶는다.
   * 싱가포르 05:00 = KST 06:00 이라 같은 KST 서비스 날짜 안이다
   */
  [DripGroup.SOUTHEAST_ASIA]: {
    timeZone: 'Asia/Singapore',
    minUtcOffsetMinutes: 5 * 60,
  },
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

/** 지금이 그 그룹의 오늘 알림 시각(기본 현지 07:00 — `slot`) 이후인가 — 현지 자정 전까지만 참이다 */
export function isAfterArrivalPushTime(
  now: Date,
  group: DripGroup,
  slot: DripArrivalSlot = DripArrivalSlot.H0700,
): boolean {
  const { hour, minute } = DRIP_ARRIVAL_SLOT_TIMES[slot];

  return (
    localMinutesOf(DRIP_GROUP_SCHEDULES[group].timeZone, now) >=
    hour * 60 + minute
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

/** 그 시간대 현지 자정부터 지난 분 */
export function localMinutesOf(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = (type: 'hour' | 'minute'): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return value('hour') * 60 + value('minute');
}
