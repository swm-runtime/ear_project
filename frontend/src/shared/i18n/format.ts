import { APP_LANGUAGE, DISPLAY_LOCALE, type AppLanguage } from './locale';

/**
 * 날짜·복수형 표기(KAN-197 — `spec/api/global-api.md` 2.4). 문구 조립은 각 `*.copy.ts` 가 하고, 여기는 **값 → 그 언어의
 * 표기**만 한다.
 *
 * - **한국어는 종전 문자열을 그대로 만든다**("10월 15일" · "2026년 10월 15일") — 기기마다 ICU 데이터가 달라 `Intl` 결과가
 *   한 글자라도 바뀌면 한국어 화면이 종전과 달라진다(KAN-194 완료 조건 "기기 언어 ko → 종전과 동일").
 * - **영어는 `Intl.DateTimeFormat`·`Intl.PluralRules`** 로 그린다 — 기기 로캘의 순서를 따른다(en-US "Oct 15" · en-GB "15 Oct").
 *
 * 날짜는 두 종류다.
 * - **달력 날짜**(서버 날짜 라벨 `YYYY-MM-DD` — `service_date`·`week_start`·`last_free_date` 등): 서버가 KST 서비스 날짜로
 *   이미 판정한 값이다. `new Date('YYYY-MM-DD')` 는 UTC 자정으로 읽혀 서쪽 시간대(America/New_York)에서 하루 앞당겨지므로
 *   **문자열을 연·월·일로 나눠** 그대로 그린다(`parseDateLabel`). 기기 시각으로 다시 계산하지 않는다.
 * - **순간**(ISO 8601 UTC 시각 — `renews_at`·`published_at` 등): 기기 시간대의 달력 날짜로 바꿔 그린다(`toLocalDate` —
 *   표시 전용이다. 판정은 서버 몫).
 */

/** 시간대 없는 달력 날짜 — 표기 전용 */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** 표기 로캘 — 기기 로캘이 표시 언어와 같은 언어면 기기 로캘(지역 순서를 따른다), 아니면 그 언어의 기본 로캘 */
export const formatLocaleOf = (
  language: AppLanguage,
  displayLocale: string = DISPLAY_LOCALE,
): string =>
  displayLocale.toLowerCase().startsWith(language)
    ? displayLocale
    : language === 'ko'
      ? 'ko-KR'
      : 'en-US';

/** 서버 날짜 라벨 `YYYY-MM-DD` → 연·월·일. 시간대를 거치지 않는다 */
export const parseDateLabel = (label: string): CalendarDate => {
  const [year, month, day] = label.split('-').map(Number);
  return { year, month, day };
};

/**
 * ISO UTC 순간 → 달력 날짜(표시 전용). 기본은 **기기 시간대**(JS 엔진의 로컬 시각 — 종전 `getMonth()` 표기와 같다).
 * `timeZone` 을 주면 그 시간대로 읽는다(테스트에서 America/New_York 같은 시간대를 고정할 때 · 엔진이 못 읽으면 기기 시간대)
 */
export const toLocalDate = (iso: string, timeZone?: string): CalendarDate => {
  const date = new Date(iso);
  if (timeZone !== undefined) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }).formatToParts(date);
      const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
      const zoned = { year: part('year'), month: part('month'), day: part('day') };
      if (!Number.isNaN(zoned.year + zoned.month + zoned.day)) return zoned;
    } catch {
      // 아래 기기 시간대
    }
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
};

/**
 * 두 날짜 라벨 사이의 날 수(`to - from`). **라벨끼리의 달력 셈**이다 — UTC 자정으로 놓고 빼므로 기기 시간대·서머타임이
 * 끼지 않는다. 예: 주 월요일 라벨과 오늘 서비스 날짜 라벨로 오늘의 요일 칸을 고른다
 */
export const daysBetweenDateLabels = (from: string, to: string): number => {
  const a = parseDateLabel(from);
  const b = parseDateLabel(to);
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
};

const EN_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * 달력 날짜를 `Intl` 로 그린다 — UTC 자정의 순간을 **UTC 시간대로** 포맷하므로 기기 시간대가 날짜를 밀지 않는다.
 * `Intl` 이 없거나 로캘을 못 읽는 엔진이면 en-US 모양으로 폴백한다(표시가 비지 않게)
 */
const formatCalendar = (
  date: CalendarDate,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  fallback: () => string,
): string => {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(Date.UTC(date.year, date.month - 1, date.day)),
    );
  } catch {
    return fallback();
  }
};

/** 월·일 — ko "10월 15일" · en "Oct 15"(en-GB "15 Oct") */
export const formatMonthDay = (
  date: CalendarDate,
  language: AppLanguage = APP_LANGUAGE,
  locale: string = formatLocaleOf(language),
): string => {
  if (language === 'ko') return `${date.month}월 ${date.day}일`;
  return formatCalendar(
    date,
    locale,
    { month: 'short', day: 'numeric' },
    () => `${EN_MONTHS_SHORT[date.month - 1] ?? ''} ${date.day}`,
  );
};

/** 연·월·일 — ko "2026년 10월 15일" · en "Oct 15, 2026"(en-GB "15 Oct 2026") */
export const formatFullDate = (
  date: CalendarDate,
  language: AppLanguage = APP_LANGUAGE,
  locale: string = formatLocaleOf(language),
): string => {
  if (language === 'ko') return `${date.year}년 ${date.month}월 ${date.day}일`;
  return formatCalendar(
    date,
    locale,
    { year: 'numeric', month: 'short', day: 'numeric' },
    () => `${EN_MONTHS_SHORT[date.month - 1] ?? ''} ${date.day}, ${date.year}`,
  );
};

/** 서버 날짜 라벨 → 월·일(시간대 무관) */
export const formatDateLabelMonthDay = (
  label: string,
  language: AppLanguage = APP_LANGUAGE,
  locale?: string,
): string => formatMonthDay(parseDateLabel(label), language, locale ?? formatLocaleOf(language));

/** ISO 순간 → 기기 시간대의 월·일 */
export const formatInstantMonthDay = (
  iso: string,
  language: AppLanguage = APP_LANGUAGE,
  locale?: string,
): string => formatMonthDay(toLocalDate(iso), language, locale ?? formatLocaleOf(language));

/**
 * 복수형 범주 — `Intl.PluralRules` 를 쓰되, **Hermes 는 `PluralRules` 를 싣지 않은 버전이 있어** 없으면 영어 규칙
 * (1 = one, 그 밖 other)으로 폴백한다. 1단계 언어는 ko·en 뿐이라 폴백이 곧 정답이다
 */
export const selectPlural = (count: number, locale: string = formatLocaleOf('en')): string => {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function') {
      return new Intl.PluralRules(locale).select(count);
    }
  } catch {
    // 로캘을 못 읽는 엔진 — 아래 영어 규칙
  }
  return count === 1 ? 'one' : 'other';
};

/** 영어 수량 "1 episode" · "3 episodes" — 단·복수 낱말을 받아 수와 잇는다 */
export const formatEnCount = (
  count: number,
  forms: { one: string; other: string },
  locale: string = formatLocaleOf('en'),
): string => `${count} ${selectPlural(count, locale) === 'one' ? forms.one : forms.other}`;

/**
 * 정수에 세 자리마다 쉼표 — `3900` → `"3,900"`. 서버가 준 원화 금액(요금제 정가 `original_price_krw`, KAN-299)을 그릴 때
 * 쓴다. `Intl.NumberFormat` 을 쓰지 않는다 — 기기마다 ICU 데이터가 달라 한국어 표기가 흔들릴 수 있다(날짜와 같은 이유)
 */
export const groupThousands = (value: number): string =>
  String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
