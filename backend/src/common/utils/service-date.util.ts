/**
 * domain.md 1.2 — **하루의 경계는 자정이 아니라 04:00 KST다.** 03:59의 행위는 전날로 계산한다.
 *
 * 서로 다른 경계를 쓰면 페이월 카운트와 통계가 영구히 어긋나므로,
 * **경계 계산은 이 파일에만 두고 전 모듈이 이것만 호출한다.**
 *
 * 애플리케이션은 시각을 UTC로 다루고 표시·경계 판정만 KST로 한다.
 *
 * ## 05:00 전환 (KAN-149, 2026-10-07)
 *
 * 팀 합의로 경계를 **05:00 KST로 옮긴다.** 전환 시각은 코드에 박지 않고 env
 * `SERVICE_DAY_BOUNDARY_05_FROM`(ISO 8601 시각)으로 받는다 — 약관 공지 기간을 PM 이 정하기 때문이다.
 * **그 시각 전의 시각은 04:00 경계, 그 시각부터는 05:00 경계**로 계산한다. 비어 있으면 04:00 그대로다.
 *
 * 시각 기준으로 가르므로 과거 `play_records.play_date`·통계 재집계도 그대로 맞는다. 전환 시각은
 * **KST 05:00 정각을 권장**한다 — 그러면 전환일 하루가 한 시간 길어질 뿐(04:00~다음 날 05:00) 겹침·빈틈이
 * 없다. KST 04:00~04:59 사이의 시각은 금지한다(그 구간에서는 옛 규칙이 오늘, 새 규칙이 어제라 날짜가 거꾸로 간다
 * — `env.validation.ts`가 막는다).
 */

const KST_OFFSET_MINUTES = 9 * 60;
const LEGACY_SERVICE_DAY_START_HOUR = 4;
const SERVICE_DAY_START_HOUR_FROM_SWITCH = 5;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DAYS_IN_WEEK = 7;

export const SERVICE_DAY_BOUNDARY_SWITCH_ENV = 'SERVICE_DAY_BOUNDARY_05_FROM';

/** env 원문 → 파싱 결과를 한 번만 계산한다. 원문이 바뀌면(테스트) 다시 읽는다 */
let cachedSwitchRaw: string | undefined;
let cachedSwitchAt: Date | null = null;

/**
 * 05:00 경계로 넘어가는 시각. env 가 비어 있거나 파싱이 안 되면 `null`(= 계속 04:00).
 *
 * `process.env`를 호출 때마다 보는 이유 — 이 유틸은 ConfigModule 보다 먼저 import 되는 순수 모듈이라
 * 모듈 로드 시점에 읽으면 `.env`가 아직 올라오기 전일 수 있다. 값 검증은 `env.validation.ts`가 한다.
 */
export function serviceDayBoundarySwitchAt(): Date | null {
  const raw = process.env[SERVICE_DAY_BOUNDARY_SWITCH_ENV];
  if (raw === cachedSwitchRaw) return cachedSwitchAt;

  cachedSwitchRaw = raw;
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') {
    cachedSwitchAt = null;
  } else {
    const parsed = new Date(trimmed);
    cachedSwitchAt = Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return cachedSwitchAt;
}

/** 주어진 **시각**에 적용되는 하루 시작 시(KST). 전환 시각 전이면 4, 그때부터 5 */
export function serviceDayStartHour(date: Date): number {
  const switchAt = serviceDayBoundarySwitchAt();
  return switchAt !== null && date.getTime() >= switchAt.getTime()
    ? SERVICE_DAY_START_HOUR_FROM_SWITCH
    : LEGACY_SERVICE_DAY_START_HOUR;
}

/**
 * 서비스 날짜 **라벨**이 시작되는 순간(UTC `Date`).
 *
 * 그 날짜의 04:00 KST 가 전환 시각보다 앞이면 04:00, 아니면 05:00 이다 — 전환일(D 05:00 전환)은
 * 04:00 에 시작해 다음 날 05:00 에 끝나 25시간이 된다. `toServiceDayRange`와 집계 SQL 의 경계 환산이
 * 전부 이 함수를 쓴다.
 */
export function serviceDateStart(serviceDate: string): Date {
  const kstMidnightUtc =
    parseDateLabel(serviceDate).getTime() - KST_OFFSET_MINUTES * MINUTE_MS;
  const legacyStart = new Date(
    kstMidnightUtc + LEGACY_SERVICE_DAY_START_HOUR * 60 * MINUTE_MS,
  );
  const switchAt = serviceDayBoundarySwitchAt();
  if (switchAt === null || legacyStart.getTime() < switchAt.getTime()) {
    return legacyStart;
  }
  return new Date(
    kstMidnightUtc + SERVICE_DAY_START_HOUR_FROM_SWITCH * 60 * MINUTE_MS,
  );
}

/** 주어진 시각의 KST 벽시계 값을 UTC 필드로 옮긴 Date. 계산 전용이며 저장하지 않는다 */
function toKstWallClock(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MINUTES * MINUTE_MS);
}

function formatDate(year: number, month: number, day: number): string {
  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  return `${year}-${paddedMonth}-${paddedDay}`;
}

/**
 * 서비스 날짜를 UTC 필드에 담은 Date. **계산 전용이며 저장하지 않는다** —
 * 하루 시작 시(04시, 전환 뒤 05시)를 뺀 KST 벽시계이므로 이 값의 `getUTC*`가 곧 서비스 날짜의 연·월·일이다.
 */
function toServiceDay(date: Date): Date {
  return new Date(
    toKstWallClock(date).getTime() - serviceDayStartHour(date) * 60 * MINUTE_MS,
  );
}

/**
 * 주어진 시각이 속한 **서비스 날짜의 시각 범위** `[start, end)` — 04:00 KST부터 다음 날 04:00 KST 전까지
 * (전환 뒤에는 05:00. 전환일은 04:00~다음 날 05:00).
 *
 * 날짜 라벨이 아니라 `timestamptz` 컬럼을 하루 단위로 잘라야 하는 판정에 쓴다(예: 알림 하루 1건 —
 * `notification.md` 4.3). 라벨로 바꿔 비교하면 SQL이 행마다 KST 변환을 해야 해 인덱스를 못 탄다.
 *
 * `end`는 `start + 24h`가 아니라 **다음 라벨의 시작**이다 — 전환일 하루는 25시간이다.
 */
export function toServiceDayRange(date: Date): { start: Date; end: Date } {
  const label = toServiceDate(date);

  return {
    start: serviceDateStart(label),
    end: serviceDateStart(shiftServiceDate(label, 1)),
  };
}

/** 하루 경계(04시, 전환 뒤 05시)를 적용한 서비스 날짜 (`YYYY-MM-DD`) */
export function toServiceDate(date: Date): string {
  const serviceDay = toServiceDay(date);

  return formatDate(
    serviceDay.getUTCFullYear(),
    serviceDay.getUTCMonth() + 1,
    serviceDay.getUTCDate(),
  );
}

/**
 * **직전 확정 주**의 시작일 = 지난주 월요일 (`YYYY-MM-DD`).
 *
 * 주 경계는 **월요일 05:00 ~ 다음 월요일 04:59**이므로(domain.md 1.2) 요일 판정도
 * 서비스 날짜 기준이다 — 월요일 04시의 조회는 아직 지난주 안에 있고, 그때 "직전 확정 주"는
 * 2주 전 월요일이다. 자정 경계로 세면 이 5시간 동안만 다른 주가 인기 섹션에 실린다.
 *
 * 진행 중인 주를 쓰지 않는 이유는 주초에 표본이 부족해 랭킹이 무너지기 때문이다
 * (domain.md 5.4 — 직전 확정 구간의 값으로 순위를 보여준다).
 */
export function toPreviousFinalWeekStart(date: Date): string {
  const serviceDay = toServiceDay(date);
  // getUTCDay는 일요일이 0이다. 월요일을 주의 시작으로 두려면 하루씩 당겨 센다
  const daysSinceMonday = (serviceDay.getUTCDay() + 6) % 7;
  const previousMonday = new Date(
    serviceDay.getTime() - (daysSinceMonday + DAYS_IN_WEEK) * DAY_MS,
  );

  return formatDate(
    previousMonday.getUTCFullYear(),
    previousMonday.getUTCMonth() + 1,
    previousMonday.getUTCDate(),
  );
}

/**
 * **진행 중인 주**의 시작일 = 이번 주 월요일 (`YYYY-MM-DD`).
 *
 * `toPreviousFinalWeekStart`와 같은 경계(월요일 05:00)를 쓰되 한 주를 빼지 않는다 —
 * 프로필의 주간 그래프는 확정 집계가 아니라 **진행 중인 주를 기본으로 보여주기** 때문이다
 * (`profile.md` 4.6). 순위용 집계와 사용자 축 통계가 같은 경계를 공유해야
 * 두 화면의 "이번 주"가 어긋나지 않는다.
 */
export function toCurrentWeekStart(date: Date): string {
  const serviceDay = toServiceDay(date);
  const daysSinceMonday = (serviceDay.getUTCDay() + 6) % 7;
  const monday = new Date(serviceDay.getTime() - daysSinceMonday * DAY_MS);

  return formatDate(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
  );
}

/** `YYYY-MM-DD` 라벨을 UTC 필드에 담은 Date로. 계산 전용이며 저장하지 않는다 */
function parseDateLabel(label: string): Date {
  const [year, month, day] = label.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * 주 시작 라벨이 **월요일인지** 판정한다.
 *
 * 클라이언트는 응답의 `previous_week_start`를 그대로 되돌려 보내므로 정상 경로에서는
 * 항상 참이다(`profile-api.md` 4.2 — 클라이언트 날짜 연산 0). 임의의 날짜가 들어오면
 * 주 경계가 어긋난 7일 창을 집계하게 되므로 방어적으로 거절한다.
 */
export function isWeekStartLabel(label: string): boolean {
  const parsed = parseDateLabel(label);

  return !Number.isNaN(parsed.getTime()) && parsed.getUTCDay() === 1;
}

/**
 * 서비스 날짜 라벨을 일 단위로 이동한다. `days`가 음수면 과거로 간다.
 *
 * 재청취 창(`paywall.md` 4.3-1)처럼 **날짜 라벨끼리 범위를 비교해야 하는** 판정에 쓴다.
 * 시각에서 15일을 빼고 다시 서비스 날짜로 환산하면 05시 경계를 두 번 적용하게 되어
 * 04:00~05:00 사이에 하루가 밀린다 — 라벨을 얻은 뒤 라벨 위에서 옮긴다.
 */
export function shiftServiceDate(serviceDate: string, days: number): string {
  const shifted = new Date(
    parseDateLabel(serviceDate).getTime() + days * DAY_MS,
  );

  return formatDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/** 주 시작 라벨을 주 단위로 이동한다. `weeks`가 음수면 과거로 간다 */
export function shiftWeekStart(weekStart: string, weeks: number): string {
  const shifted = new Date(
    parseDateLabel(weekStart).getTime() + weeks * DAYS_IN_WEEK * DAY_MS,
  );

  return formatDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/**
 * 주 시작 라벨이 덮는 **월~일 7개 서비스 날짜**를 순서대로 돌려준다.
 *
 * `play_records.play_date`가 이미 05시 경계로 계산된 서비스 날짜이므로(domain.md 1.2),
 * 주간 집계는 이 7개 라벨과 직접 대조하면 된다 — 시각 범위로 다시 자르지 않는다.
 */
export function toWeekDates(weekStart: string): string[] {
  const monday = parseDateLabel(weekStart);

  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
    const day = new Date(monday.getTime() + index * DAY_MS);
    return formatDate(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
    );
  });
}

/**
 * **직전 확정 월**의 시작일 (`YYYY-MM-01`).
 *
 * 5월이면 4월을 가리킨다 — 진행 중인 달의 미확정 집계를 쓰면 순위가 매일 흔들린다
 * (domain.md 5.4, `features/README.md` 결정 20번).
 *
 * **`toServiceDay`를 거친다**(주간 함수와 같은 이유 — domain.md 1.2). 자정으로 세면
 * 매달 1일 00~05시 동안만 한 달이 앞서 넘어가, 아직 경계 뒤 집계 배치가 쓰지 않은
 * `period_start`를 조회하게 된다. 월간은 탐색 인기 섹션의 **기본 구간**이라
 * 그 5시간 동안 목록이 조용히 빈다.
 */
export function toPreviousFinalMonthStart(date: Date): string {
  const serviceDay = toServiceDay(date);
  const year = serviceDay.getUTCFullYear();
  const month = serviceDay.getUTCMonth() + 1;

  return month === 1
    ? formatDate(year - 1, 12, 1)
    : formatDate(year, month - 1, 1);
}
