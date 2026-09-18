/**
 * 수면 타이머(FR-25 P1 — `player.md` 4.7 · `player-uiux.md` 4.6 PL5)의 순수 규칙.
 * 선택지는 문서가 정한 다섯 개뿐이다: 5분 · 10분 · 15분 · 30분 · 이 에피소드 종료 시(+ 해제).
 */

/** 분 단위 선택지 */
export const SLEEP_TIMER_MINUTES = [5, 10, 15, 30] as const;
export type SleepTimerMinutes = (typeof SLEEP_TIMER_MINUTES)[number];

/** 설정된 타이머 — 분 단위 또는 "이 에피소드 종료 시" */
export type SleepTimerChoice =
  { kind: 'minutes'; minutes: SleepTimerMinutes } | { kind: 'endOfEpisode' };

export const isSameSleepTimerChoice = (
  a: SleepTimerChoice | null,
  b: SleepTimerChoice | null,
): boolean => {
  if (a === null || b === null) return a === b;
  if (a.kind === 'minutes' && b.kind === 'minutes') return a.minutes === b.minutes;
  return a.kind === b.kind;
};

/** 만료 시각(ms)에서 남은 초 — 음수가 되지 않는다. 표시는 올림이다: 0.4초 남았을 때 "00:00"이면 이미 끝난 것처럼 읽힌다 */
export const remainingSecOf = (endsAtMs: number, nowMs: number): number =>
  Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));

/** 남은 시간 알약 — "09:41"(uiux 6장). 한 시간을 넘는 선택지는 없다 */
export const formatSleepTimerRemaining = (remainingSec: number): string => {
  const safe = Math.max(0, Math.floor(remainingSec));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/** 낭독기용 — "9분 41초 남음". 시각 문자열("09:41")을 그대로 읽히지 않는다(uiux 7장) */
export const formatSleepTimerRemainingA11y = (remainingSec: number): string => {
  const safe = Math.max(0, Math.floor(remainingSec));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  if (minutes === 0) return `${seconds}초 남음`;
  if (seconds === 0) return `${minutes}분 남음`;
  return `${minutes}분 ${seconds}초 남음`;
};
