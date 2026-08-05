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

/** 주어진 시각의 KST 벽시계 값을 UTC 필드로 옮긴 Date. 계산 전용이며 저장하지 않는다 */
function toKstWallClock(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MINUTES * MINUTE_MS);
}

function formatDate(year: number, month: number, day: number): string {
  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  return `${year}-${paddedMonth}-${paddedDay}`;
}

/** 04시 경계를 적용한 서비스 날짜 (`YYYY-MM-DD`) */
export function toServiceDate(date: Date): string {
  const shifted = new Date(
    toKstWallClock(date).getTime() - SERVICE_DAY_START_HOUR * 60 * MINUTE_MS,
  );

  return formatDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/**
 * **직전 확정 월**의 시작일 (`YYYY-MM-01`).
 *
 * 5월이면 4월을 가리킨다 — 진행 중인 달의 미확정 집계를 쓰면 순위가 매일 흔들린다
 * (domain.md 5.4, `pages/README.md` 결정 20번).
 */
export function toPreviousFinalMonthStart(date: Date): string {
  const kst = toKstWallClock(date);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;

  return month === 1
    ? formatDate(year - 1, 12, 1)
    : formatDate(year, month - 1, 1);
}
