import { describe, expect, it } from '@jest/globals';

import { FALLBACK_MIN_AGE, resolveMinAge } from './auth.constants';
import { AUTH_COPY, ageConfirmationLabel } from './auth.copy';

const HANGUL = /[ㄱ-ㆎ가-힣]/;

describe('연령 확인 문구는 서버가 판정한 기준 연령을 끼운다(KAN-206 나라별)', () => {
  it('한국어 18은 종전 KR 문구 그대로다(회귀)', () => {
    expect(ageConfirmationLabel(18, 'ko')).toBe('만 18세 이상입니다');
    expect(ageConfirmationLabel(18, 'ko')).toBe(AUTH_COPY.consent.ageConfirmation);
  });

  it('16·18 모두 표시 언어로 그린다', () => {
    expect(ageConfirmationLabel(16, 'ko')).toBe('만 16세 이상입니다');
    expect(ageConfirmationLabel(16, 'en')).toBe('I confirm that I am 16 or older');
    expect(ageConfirmationLabel(18, 'en')).toBe('I confirm that I am 18 or older');
  });

  it('영어 표시의 연령 문구에는 한국어 글자가 없다', () => {
    expect(ageConfirmationLabel(16, 'en')).not.toMatch(HANGUL);
    expect(ageConfirmationLabel(18, 'en')).not.toMatch(HANGUL);
  });
});

describe('기준 연령 — 서버 값 우선, 없으면 시장의 보수값 18', () => {
  const ageRow = { consentType: 'age_confirmation' as const, version: null, isRequired: true };

  it('서버가 min_age 를 주면 그 값이다', () => {
    expect(resolveMinAge({ ...ageRow, minAge: 16 }, 'global')).toBe(16);
  });

  it('구 서버(min_age 없음)·연령 행 없음이면 두 시장 모두 18이다', () => {
    expect(FALLBACK_MIN_AGE).toEqual({ kr: 18, global: 18 });
    expect(resolveMinAge(ageRow, 'global')).toBe(18);
    expect(resolveMinAge(undefined, 'kr')).toBe(18);
  });
});
