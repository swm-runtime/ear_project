import { describe, expect, it } from '@jest/globals';

import { PLAYER_COPY } from './player.copy';
import { currentSectionOf, sectionDisplayOf } from './player.section';

const SECTIONS = [
  { startSec: 0, title: '인트로', kind: 'intro' as const },
  { startSec: 20, title: '도입', kind: 'lead' as const },
  { startSec: 75, title: '회의가 길어지는 진짜 이유', kind: 'body' as const },
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
    expect(currentSectionOf([{ startSec: 5, title: '도입', kind: null }], 2)).toBeNull();
  });
});

describe('sectionDisplayOf — 구역 라벨(PM 2026-10-07)', () => {
  const copy = PLAYER_COPY.screen;

  it('본문 단락은 라벨 "본론" + 단락 제목이다', () => {
    expect(
      sectionDisplayOf({ startSec: 75, title: '회의가 길어지는 진짜 이유', kind: 'body' }, copy),
    ).toEqual({ label: '본론', title: '회의가 길어지는 진짜 이유' });
  });

  it('인트로·도입은 "개요", 마무리는 "결론" 한 줄이다(라벨 없음)', () => {
    expect(sectionDisplayOf({ startSec: 0, title: '인트로', kind: 'intro' }, copy)).toEqual({
      label: null,
      title: '개요',
    });
    expect(sectionDisplayOf({ startSec: 20, title: '도입', kind: 'lead' }, copy).title).toBe(
      '개요',
    );
    expect(sectionDisplayOf({ startSec: 480, title: '마무리', kind: 'outro' }, copy).title).toBe(
      '결론',
    );
  });

  it('서버가 구역을 안 실었으면 "지금 듣는 구간" + 서버 제목이다', () => {
    expect(sectionDisplayOf({ startSec: 0, title: '본문', kind: null }, copy)).toEqual({
      label: '지금 듣는 구간',
      title: '본문',
    });
  });
});
