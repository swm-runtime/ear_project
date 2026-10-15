import { describe, expect, it } from '@jest/globals';

import { legalUrlsFor, PRIVACY_POLICY_URL, TERMS_URL } from './legal-urls';

describe('legal-urls — 표시 언어별 약관·개인정보처리방침 주소', () => {
  it('한국어는 종전 주소(env 가 없으면 랜딩 /terms · /privacy)', () => {
    expect(legalUrlsFor('ko')).toEqual({
      terms: 'https://earcast.co.kr/terms',
      privacy: 'https://earcast.co.kr/privacy',
    });
  });

  it('영어는 랜딩의 영어 본문 /en/terms · /en/privacy', () => {
    expect(legalUrlsFor('en')).toEqual({
      terms: 'https://earcast.co.kr/en/terms',
      privacy: 'https://earcast.co.kr/en/privacy',
    });
  });

  it('내보내는 상수는 지금 표시 언어(테스트는 한국어)의 주소다', () => {
    expect(TERMS_URL).toBe('https://earcast.co.kr/terms');
    expect(PRIVACY_POLICY_URL).toBe('https://earcast.co.kr/privacy');
  });
});
