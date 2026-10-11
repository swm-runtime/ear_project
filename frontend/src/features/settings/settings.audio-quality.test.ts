import { describe, expect, it } from '@jest/globals';

import { visibleAudioQualityOptions } from './settings.audio-quality';

const LOCKED = [
  { quality: 'compressed' as const, allowed: true },
  { quality: 'lossless' as const, allowed: false },
];
const OPEN = [
  { quality: 'compressed' as const, allowed: true },
  { quality: 'lossless' as const, allowed: true },
];

describe('visibleAudioQualityOptions — 설정 음질 섹션(settings.md 4.6)', () => {
  it('구독 UI 가 켜져 있으면 잠긴 선택지도 그린다', () => {
    expect(visibleAudioQualityOptions(LOCKED, true)).toEqual(LOCKED);
  });

  it('구독 UI 가 꺼져 있으면 잠긴 선택지를 빼고, 하나만 남으면 섹션을 그리지 않는다', () => {
    expect(visibleAudioQualityOptions(LOCKED, false)).toBeNull();
  });

  it('둘 다 허용이면 구독 UI 와 무관하게 그린다', () => {
    expect(visibleAudioQualityOptions(OPEN, false)).toEqual(OPEN);
  });

  it('옛 서버(목록 없음)면 그리지 않는다', () => {
    expect(visibleAudioQualityOptions(null, true)).toBeNull();
  });
});
