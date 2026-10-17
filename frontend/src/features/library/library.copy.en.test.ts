import { describe, expect, it, jest } from '@jest/globals';

import { LIBRARY_COPY } from './library.copy';

// 표시 언어를 영어로 고정한다 — jest.setup.js 의 한국어 고정을 이 파일에서만 덮는다(copy-en-format.test.ts 와 같은 방식)
jest.mock('@/shared/i18n/locale', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/shared/i18n/locale'),
  APP_LANGUAGE: 'en',
  DISPLAY_LOCALE: 'en-US',
}));

const HANGUL = /[가-힣]/;

describe('추천 별점 팝업 영어 카피(KAN-224 — GLOBAL 사용자도 같은 팝업을 본다)', () => {
  it('티켓의 영어 안 그대로다', () => {
    expect(LIBRARY_COPY.dripFeedback.title).toBe('How were your recent picks?');
    expect(LIBRARY_COPY.dripFeedback.send).toBe('Send');
    expect(LIBRARY_COPY.dripFeedback.muteThisWeek).toBe('Not this week');
  });

  it('별 낭독은 1 이면 단수, 나머지는 복수다', () => {
    expect(LIBRARY_COPY.dripFeedback.starA11y(1)).toBe('1 star');
    expect(LIBRARY_COPY.dripFeedback.starA11y(4)).toBe('4 stars');
  });

  it('한글이 섞이지 않는다', () => {
    const { starA11y, ratingGroupA11y, ...plain } = LIBRARY_COPY.dripFeedback;
    const all = [...Object.values(plain), starA11y(3), ratingGroupA11y('Title')];
    expect(all.filter((text) => HANGUL.test(text))).toEqual([]);
  });
});
