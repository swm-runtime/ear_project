import { describe, expect, it } from '@jest/globals';

import { currentSectionOf } from './player.section';

const SECTIONS = [
  { startSec: 0, title: '인트로' },
  { startSec: 20, title: '도입' },
  { startSec: 75, title: '회의가 길어지는 진짜 이유' },
];

describe('currentSectionOf — 지금 듣는 구간(KAN-127)', () => {
  it('재생 위치 이하에서 시작한 마지막 구간을 고른다', () => {
    expect(currentSectionOf(SECTIONS, 0)?.title).toBe('인트로');
    expect(currentSectionOf(SECTIONS, 19.9)?.title).toBe('인트로');
    expect(currentSectionOf(SECTIONS, 20)?.title).toBe('도입');
    expect(currentSectionOf(SECTIONS, 600)?.title).toBe('회의가 길어지는 진짜 이유');
  });

  it('구간이 없으면 null 이다 — 줄을 그리지 않는다', () => {
    expect(currentSectionOf([], 30)).toBeNull();
  });

  it('첫 구간 시작 전이면 null 이다', () => {
    expect(currentSectionOf([{ startSec: 5, title: '도입' }], 2)).toBeNull();
  });
});
