import { describe, expect, it, jest } from '@jest/globals';

import { resolveSectionTitle } from './explore.section-title';

// 표시 언어를 영어로 고정한다 — jest.setup.js 의 한국어 고정을 이 파일에서만 덮는다(copy-en-format.test.ts 와 같은 방식)
jest.mock('@/shared/i18n/locale', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/shared/i18n/locale'),
  APP_LANGUAGE: 'en',
  DISPLAY_LOCALE: 'en-US',
}));

describe('resolveSectionTitle — 영어 표시(KAN-194 실기기: 서버 한국어 제목이 보였다)', () => {
  it('아는 종류는 서버가 한국어를 줘도 영어 문구', () => {
    expect(resolveSectionTitle({ sectionKey: 'interest', title: '관심사에 맞는 추천' })).toBe(
      'Recommended',
    );
    expect(resolveSectionTitle({ sectionKey: 'new', title: '새로 나온 콘텐츠' })).toBe(
      'New episodes',
    );
    expect(resolveSectionTitle({ sectionKey: 'popular', title: '인기 콘텐츠' })).toBe('Popular');
  });

  it('주제 섹션은 서버 주제 이름 그대로 — 시장별 행이라 앱이 번역하지 않는다', () => {
    expect(resolveSectionTitle({ sectionKey: 'topic_group', title: 'K-Culture' })).toBe(
      'K-Culture',
    );
  });
});
