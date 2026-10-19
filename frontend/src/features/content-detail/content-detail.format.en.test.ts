import { describe, expect, it, jest } from '@jest/globals';

import { formatSeriesLabel } from './content-detail.format';

// 표시 언어를 영어로 고정한다 — jest.setup.js 의 한국어 고정을 이 파일에서만 덮는다(explore.section-title.en.test.ts 와 같은 방식)
jest.mock('@/shared/i18n/locale', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/shared/i18n/locale'),
  APP_LANGUAGE: 'en',
  DISPLAY_LOCALE: 'en-US',
}));

describe('formatSeriesLabel — 영어 표시(KAN-225)', () => {
  it('시리즈 제목이 있으면 "{title} · Episode M of N"', () => {
    expect(formatSeriesLabel({ title: 'CS in Keywords', episodeNo: 3, totalEpisodes: 16 })).toBe(
      'CS in Keywords · Episode 3 of 16',
    );
  });

  it('시리즈 제목이 없으면 종전 "Episode M of N"', () => {
    expect(formatSeriesLabel({ title: null, episodeNo: 1, totalEpisodes: 3 })).toBe(
      'Episode 1 of 3',
    );
  });
});
