/**
 * domain.md 1.2 — **하루의 경계는 자정이 아니라 04:00 KST다.** 03:59의 행위는 전날로 계산한다.
 *
 * 서로 다른 경계를 쓰면 페이월 카운트와 통계가 영구히 어긋나므로,
 * **경계 계산은 이 파일에만 두고 전 모듈이 이것만 호출한다.**
 *
 * 애플리케이션은 시각을 UTC로 다루고 표시·경계 판정만 KST로 한다.
 */

const KST_OFFSET_MINUTES = 9 * 60;
const SERVICE_DAY_START_HOUR = 4;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DAYS_IN_WEEK = 7;

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
 * 04시를 뺀 KST 벽시계이므로 이 값의 `getUTC*`가 곧 서비스 날짜의 연·월·일이다.
 */
function toServiceDay(date: Date): Date {
  return new Date(
    toKstWallClock(date).getTime() - SERVICE_DAY_START_HOUR * 60 * MINUTE_MS,
  );
}

/** 04시 경계를 적용한 서비스 날짜 (`YYYY-MM-DD`) */
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
 * 주 경계는 **월요일 04:00 ~ 다음 월요일 03:59**이므로(domain.md 1.2) 요일 판정도
 * 서비스 날짜 기준이다 — 월요일 03시의 조회는 아직 지난주 안에 있고, 그때 "직전 확정 주"는
 * 2주 전 월요일이다. 자정 경계로 세면 이 4시간 동안만 다른 주가 인기 섹션에 실린다.
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
 * `toPreviousFinalWeekStart`와 같은 경계(월요일 04:00)를 쓰되 한 주를 빼지 않는다 —
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
 * 시각에서 15일을 빼고 다시 서비스 날짜로 환산하면 04시 경계를 두 번 적용하게 되어
 * 03:00~04:00 사이에 하루가 밀린다 — 라벨을 얻은 뒤 라벨 위에서 옮긴다.
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
 * `play_records.play_date`가 이미 04시 경계로 계산된 서비스 날짜이므로(domain.md 1.2),
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
 */
export function toPreviousFinalMonthStart(date: Date): string {
  const kst = toKstWallClock(date);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;

  return month === 1
    ? formatDate(year - 1, 12, 1)
    : formatDate(year, month - 1, 1);
}
