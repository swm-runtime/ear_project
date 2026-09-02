/**
 * 표기 판정 순수 함수 — 문구 조립은 profile.copy.ts가 하고, 여기는 숫자·상태 판정만 한다.
 * 테스트 러너 도입 시 그대로 단위 테스트 대상이 되도록 React 밖 순수 함수로 분리한다
 * (library.new-arrival.ts와 같은 관례).
 *
 * 여기 없는 것: streak·ratio 가공 — 서버 값을 그대로 그린다(재판정·재정규화 금지, profile-uiux.md 8장).
 */
import type { InterestSummary, ProfileCareer } from './profile.types';

/** email × isEmailVerified → 세 상태(profile.md 4.3). 두 값은 항상 함께 온다(profile-api.md 4.1) */
export const deriveEmailStatus = (
  email: string | null,
  isEmailVerified: boolean,
): 'unregistered' | 'unverified' | 'verified' => {
  if (email === null) return 'unregistered';
  return isEmailVerified ? 'verified' : 'unverified';
};

/**
 * 청취 시간 요약 표기의 단위·값 판정(profile-uiux.md 4.6 확정) —
 * 60분 미만은 분(초 버림), 60분 이상은 시간(분 버림). 반올림·올림하지 않는다.
 * 예: 3599초 → 59분, 114000초(31시간 40분) → 31시간
 */
export const toListenedSummaryParts = (
  totalSec: number,
): { unit: 'minutes'; value: number } | { unit: 'hours'; value: number } =>
  totalSec < 3600
    ? { unit: 'minutes', value: Math.floor(totalSec / 60) }
    : { unit: 'hours', value: Math.floor(totalSec / 3600) };

/** 요일별 값의 스크린리더 표기용(profile-uiux.md 7장) — 60분 이상이면 "N시간 N분"으로 읽는다 */
export const toListenedDayParts = (sec: number): { hours: number; minutes: number } => ({
  hours: Math.floor(sec / 3600),
  minutes: Math.floor((sec % 3600) / 60),
});

/** ISO UTC 시각 → 기기 로캘의 월·일. 판정은 서버 몫이고 표기만 클라이언트가 한다(profile-uiux.md 6장) */
export const toMonthDayParts = (iso: string): { month: number; day: number } => {
  const date = new Date(iso);
  return { month: date.getMonth() + 1, day: date.getDate() };
};

/**
 * 주 범위(월~일)의 양 끝 월·일. 주 경계 판정은 서버가 하고(week_start 라벨),
 * 여기의 +6일은 표기 전용 연산이다(profile-uiux.md 4.6 "N월 N일 – N월 N일"이 허용하는 유일한 날짜 연산).
 * new Date('YYYY-MM-DD')는 UTC 자정으로 파싱돼 로캘에 따라 하루 밀린다 — y/m/d 수동 파싱으로 로컬 생성.
 */
export const toWeekRangeParts = (
  weekStart: string,
): { start: { month: number; day: number }; end: { month: number; day: number } } => {
  const [year, month, day] = weekStart.split('-').map(Number);
  const startDate = new Date(year, month - 1, day);
  const endDate = new Date(year, month - 1, day + 6);
  return {
    start: { month: startDate.getMonth() + 1, day: startDate.getDate() },
    end: { month: endDate.getMonth() + 1, day: endDate.getDate() },
  };
};

/**
 * 관심 주제 카드의 +N — N = count - 표시 칩 수. 상한(3개) 도입 이전 초과 보유자에게만
 * 나타난다(interest-management.md 7장). 0 이하면 표시하지 않는다.
 */
export const toInterestOverflowCount = (summary: InterestSummary): number | null => {
  const overflow = summary.count - summary.topTopics.length;
  return overflow > 0 ? overflow : null;
};

/** 셋 다 null일 때만 미입력 변형이다 — 하나라도 있으면 입력됨 표시(profile-uiux.md 4.5) */
export const isCareerEmpty = (career: ProfileCareer): boolean =>
  career.jobCategory === null && career.jobTitle === null && career.yearsOfExperience === null;

/** 한 주 전체 0이면 그래프 대신 빈 상태 문구다(profile-uiux.md 4.6) */
export const isWeekAllZero = (dailyListenedSec: number[]): boolean =>
  dailyListenedSec.every((sec) => sec === 0);

/**
 * 막대 상대 높이(0~1) — 표시 중인 주의 최댓값 기준이다(profile-uiux.md 4.6).
 * 전체 0인 주는 모두 0을 돌려준다(호출부는 isWeekAllZero로 빈 상태를 먼저 가른다).
 */
export const toBarRatios = (dailyListenedSec: number[]): number[] => {
  const max = Math.max(...dailyListenedSec, 0);
  if (max === 0) return dailyListenedSec.map(() => 0);
  return dailyListenedSec.map((sec) => sec / max);
};

/**
 * 하루 평균 청취 시간(초) — 주간 그래프의 기준선 값이다.
 *
 * **아직 오지 않은 요일은 분모에서 뺀다.** 이번 주 월요일에 7로 나누면 하루치 청취가
 * 7분의 1로 눌려, 실제로는 평균만큼 들은 사람에게 "평균에 한참 못 미친다"고 보여준다.
 * 지난 주(전체 7일 경과)는 elapsedDayCount로 7이 들어온다.
 */
export const toDailyAverageSec = (dailyListenedSec: number[], elapsedDayCount: number): number => {
  const days = Math.max(1, Math.min(elapsedDayCount, dailyListenedSec.length));
  const total = dailyListenedSec.reduce((sum, sec) => sum + sec, 0);
  return Math.round(total / days);
};
