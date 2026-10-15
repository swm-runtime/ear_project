import { describe, expect, it } from '@jest/globals';

import { AUTH_COPY, ageConfirmationLabel } from './auth.copy';

const HANGUL = /[ㄱ-ㆎ가-힣]/;

describe('연령 확인 문구는 표시 언어가 아니라 시장으로 가른다(KAN-206)', () => {
  it('KR 시장은 한국어 표시에서 종전 18세 문구 그대로다(회귀)', () => {
    expect(ageConfirmationLabel('kr', 'ko')).toBe('만 18세 이상입니다');
    expect(ageConfirmationLabel('kr', 'ko')).toBe(AUTH_COPY.consent.ageConfirmation);
  });

  it('KR 시장은 영어 표시에서도 18세다 — 영어로 쓰는 한국 사용자', () => {
    expect(ageConfirmationLabel('kr', 'en')).toBe('I’m 18 or older');
  });

  it('GLOBAL 시장은 영어 표시에서 16세 문구다', () => {
    expect(ageConfirmationLabel('global', 'en')).toBe('I confirm that I am 16 or older');
  });

  it('GLOBAL 시장은 한국어 표시에서도 16세다', () => {
    expect(ageConfirmationLabel('global', 'ko')).toBe('만 16세 이상입니다');
  });

  it('영어 표시의 연령 문구에는 한국어 글자가 없다', () => {
    expect(ageConfirmationLabel('kr', 'en')).not.toMatch(HANGUL);
    expect(ageConfirmationLabel('global', 'en')).not.toMatch(HANGUL);
  });
});
