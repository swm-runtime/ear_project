import { describe, expect, it, jest } from '@jest/globals';

import { sanitizeParams } from './analytics';

// 네이티브 모듈이 없는 환경 — SDK 는 동적 로드라 stub 만 있으면 된다
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-crypto', () => ({}));
jest.mock('@/shared/lib/app-version', () => ({
  IS_DEV_API: true,
  resolveBundleLabel: () => '내장',
}));

describe('sanitizeParams — Firebase 가 확실히 받는 타입으로 고정', () => {
  it('불리언은 문자열 true/false 가 된다 — Android Bundle 은 불리언 파라미터를 버린다', () => {
    expect(sanitizeParams({ resumed: true, career_filled: false })).toEqual({
      resumed: 'true',
      career_filled: 'false',
    });
  });

  it('문자열·유한 숫자는 그대로, 100자 넘는 문자열은 자른다', () => {
    const long = 'x'.repeat(120);
    expect(sanitizeParams({ content_id: 'c1', percent: 25, s: long })).toEqual({
      content_id: 'c1',
      percent: 25,
      s: 'x'.repeat(100),
    });
  });

  it('undefined·null·NaN·객체는 뺀다 — 값이 없는 키를 보내 이벤트가 통째로 거부되지 않게', () => {
    expect(
      sanitizeParams({ a: undefined, b: null, c: Number.NaN, d: { x: 1 }, e: 'ok' }),
    ).toEqual({ e: 'ok' });
  });
});
