import { describe, expect, it } from '@jest/globals';

import {
  formatSleepTimerRemaining,
  formatSleepTimerRemainingA11y,
  isSameSleepTimerChoice,
  remainingSecOf,
} from './sleep-timer';

describe('remainingSecOf', () => {
  it('남은 시간을 초로 올림해 준다', () => {
    expect(remainingSecOf(10_000, 0)).toBe(10);
    expect(remainingSecOf(10_000, 9_600)).toBe(1);
  });

  it('만료 시각이 지나면 0이다', () => {
    expect(remainingSecOf(10_000, 10_000)).toBe(0);
    expect(remainingSecOf(10_000, 25_000)).toBe(0);
  });
});

describe('formatSleepTimerRemaining', () => {
  it('MM:SS 두 자리로 적는다', () => {
    expect(formatSleepTimerRemaining(581)).toBe('09:41');
    expect(formatSleepTimerRemaining(1800)).toBe('30:00');
    expect(formatSleepTimerRemaining(5)).toBe('00:05');
    expect(formatSleepTimerRemaining(-3)).toBe('00:00');
  });
});

describe('formatSleepTimerRemainingA11y', () => {
  it('분·초를 말로 읽는다', () => {
    expect(formatSleepTimerRemainingA11y(581)).toBe('9분 41초 남음');
    expect(formatSleepTimerRemainingA11y(600)).toBe('10분 남음');
    expect(formatSleepTimerRemainingA11y(41)).toBe('41초 남음');
  });
});

describe('isSameSleepTimerChoice', () => {
  it('같은 선택지를 같다고 본다', () => {
    expect(isSameSleepTimerChoice(null, null)).toBe(true);
    expect(
      isSameSleepTimerChoice({ kind: 'minutes', minutes: 10 }, { kind: 'minutes', minutes: 10 }),
    ).toBe(true);
    expect(isSameSleepTimerChoice({ kind: 'endOfEpisode' }, { kind: 'endOfEpisode' })).toBe(true);
  });

  it('다른 선택지·해제와는 다르다', () => {
    expect(
      isSameSleepTimerChoice({ kind: 'minutes', minutes: 10 }, { kind: 'minutes', minutes: 15 }),
    ).toBe(false);
    expect(isSameSleepTimerChoice({ kind: 'endOfEpisode' }, { kind: 'minutes', minutes: 5 })).toBe(
      false,
    );
    expect(isSameSleepTimerChoice(null, { kind: 'endOfEpisode' })).toBe(false);
  });
});
