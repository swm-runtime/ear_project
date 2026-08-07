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
