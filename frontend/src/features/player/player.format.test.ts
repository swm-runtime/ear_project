/**
 * 시간 표기 규칙 테스트 — MM:SS, 1시간 이상 H:MM:SS(player-uiux.md 6장),
 * 스크린리더 표기는 콜론 없이 뜻으로 읽힌다(7장).
 */
import { describe, expect, it } from '@jest/globals';

import { formatPlaybackTime, formatPlaybackTimeA11y } from './player.format';

describe('formatPlaybackTime', () => {
  it('1시간 미만은 MM:SS로 표기한다', () => {
    expect(formatPlaybackTime(0)).toBe('0:00');
    expect(formatPlaybackTime(72)).toBe('1:12');
    expect(formatPlaybackTime(552)).toBe('9:12');
    expect(formatPlaybackTime(1470)).toBe('24:30');
  });

  it('1시간 이상은 H:MM:SS로 표기한다', () => {
    expect(formatPlaybackTime(3600)).toBe('1:00:00');
    expect(formatPlaybackTime(3725)).toBe('1:02:05');
  });

  it('소수·음수 입력을 정수 초 표기로 보정한다', () => {
    expect(formatPlaybackTime(9.7)).toBe('0:09');
    expect(formatPlaybackTime(-3)).toBe('0:00');
  });
});

describe('formatPlaybackTimeA11y', () => {
  it('"09:12"가 아니라 "9분 12초"로 읽히게 만든다', () => {
    expect(formatPlaybackTimeA11y(552)).toBe('9분 12초');
    expect(formatPlaybackTimeA11y(1470)).toBe('24분 30초');
  });

  it('1시간 이상은 시간 단위를 앞에 붙인다', () => {
    expect(formatPlaybackTimeA11y(3725)).toBe('1시간 2분 5초');
  });

  it('0초는 "0초"로 읽힌다', () => {
    expect(formatPlaybackTimeA11y(0)).toBe('0초');
  });
});
