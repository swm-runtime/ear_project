import { describe, expect, it } from '@jest/globals';

import { legalUrlsFor } from './legal-urls';

describe('legal-urls — 시장별 약관·개인정보처리방침 주소(KAN-216)', () => {
  it('KR 은 종전 주소(env 가 없으면 랜딩 /terms · /privacy)', () => {
    expect(legalUrlsFor('kr')).toMatchObject({
      terms: 'https://earcast.co.kr/terms',
      privacy: 'https://earcast.co.kr/privacy',
    });
  });

  it('GLOBAL 은 랜딩의 영어 본문 /en/terms · /en/privacy', () => {
    expect(legalUrlsFor('global')).toMatchObject({
      terms: 'https://earcast.co.kr/en/terms',
      privacy: 'https://earcast.co.kr/en/privacy',
    });
  });

  it('국외 이전 항목은 그 시장 처리방침의 국외 이전 절(6장 — 랜딩 h2 순번 앵커 s6)을 연다', () => {
    expect(legalUrlsFor('global').crossBorderTransfer).toBe('https://earcast.co.kr/en/privacy#s6');
    expect(legalUrlsFor('kr').crossBorderTransfer).toBe('https://earcast.co.kr/privacy#s6');
  });
});
