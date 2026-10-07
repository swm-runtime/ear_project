import { describe, expect, it } from '@jest/globals';

import { PLAYER_COPY } from './player.copy';
import { chapterSegmentsOf, currentSectionOf, sectionDisplayOf } from './player.section';

const SECTIONS = [
  { startSec: 0, title: '인트로', kind: 'intro' as const, summary: null },
  { startSec: 20, title: '도입', kind: 'lead' as const, summary: null },
  { startSec: 75, title: '회의가 길어지는 진짜 이유', kind: 'body' as const, summary: null },
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
    expect(
      currentSectionOf([{ startSec: 5, title: '도입', kind: null, summary: null }], 2),
    ).toBeNull();
  });
});

describe('sectionDisplayOf — 구역 이름 + 요약(PM 2026-10-07)', () => {
  const copy = PLAYER_COPY.screen;
  const SUMMARY = '결정권자를 먼저 정하고 안건을 줄이면 회의가 절반으로 짧아진다';

  it('위는 구역 이름, 아래는 서버 요약이다', () => {
    expect(
      sectionDisplayOf(
        { startSec: 75, title: '회의가 길어지는 진짜 이유', kind: 'body', summary: SUMMARY },
        copy,
      ),
    ).toEqual({ heading: '본론', detail: SUMMARY });
    expect(
      sectionDisplayOf({ startSec: 0, title: '인트로', kind: 'intro', summary: SUMMARY }, copy)
        .heading,
    ).toBe('개요');
    expect(
      sectionDisplayOf({ startSec: 480, title: '마무리', kind: 'outro', summary: SUMMARY }, copy)
        .heading,
    ).toBe('결론');
  });

  it('요약이 없으면 서버 제목으로 대신한다 — 아래 칸이 비지 않는다', () => {
    expect(
      sectionDisplayOf({ startSec: 20, title: '도입', kind: 'lead', summary: null }, copy),
    ).toEqual({ heading: '개요', detail: '도입' });
    expect(
      sectionDisplayOf(
        { startSec: 75, title: '회의가 길어지는 진짜 이유', kind: 'body', summary: null },
        copy,
      ).detail,
    ).toBe('회의가 길어지는 진짜 이유');
  });

  it('서버가 구역을 안 실었으면 위 "지금 듣는 구간"이다', () => {
    expect(
      sectionDisplayOf({ startSec: 0, title: '본문', kind: null, summary: null }, copy),
    ).toEqual({ heading: '지금 듣는 구간', detail: '본문' });
  });
});

describe('chapterSegmentsOf — 구간별 재생 바(애플 팟캐스트 챕터)', () => {
  it('구간 시작으로 바를 나누고, 지난 조각은 꽉, 지금 조각은 비율만큼 채운다', () => {
    expect(chapterSegmentsOf([0, 20, 60], 100, 40)).toEqual([
      { share: 0.2, fill: 1 },
      { share: 0.4, fill: 0.5 },
      { share: 0.4, fill: 0 },
    ]);
  });

  it('경계가 없으면(구간 하나·없음·길이 미상) 빈 배열 — 한 줄 바를 그린다', () => {
    expect(chapterSegmentsOf([0], 100, 10)).toEqual([]);
    expect(chapterSegmentsOf([], 100, 10)).toEqual([]);
    expect(chapterSegmentsOf([0, 20], 0, 10)).toEqual([]);
  });

  it('길이 밖·중복 경계는 버린다', () => {
    expect(chapterSegmentsOf([0, 50, 50, 120], 100, 0)).toEqual([
      { share: 0.5, fill: 0 },
      { share: 0.5, fill: 0 },
    ]);
  });
});
