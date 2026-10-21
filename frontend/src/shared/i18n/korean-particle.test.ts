import { describe, expect, it } from '@jest/globals';

import { particleRo, particleWa } from './korean-particle';

describe('한국어 조사(KAN-239 검색 안내)', () => {
  it.each([
    ['커리어', '로'],
    ['면접', '으로'],
    ['이직', '으로'],
    ['서울', '로'],
    ['AI', '로'],
    ['2026', '로'],
    ['', '로'],
  ])('로/으로 — "%s" 뒤에는 "%s"', (word, expected) => {
    expect(particleRo(word)).toBe(expected);
  });

  it.each([
    ['커리오', '와'],
    ['면접', '과'],
    ['서울', '과'],
    ['AI', '와'],
  ])('와/과 — "%s" 뒤에는 "%s"', (word, expected) => {
    expect(particleWa(word)).toBe(expected);
  });

  it('끝 공백은 무시하고 마지막 글자로 판정한다', () => {
    expect(particleRo('면접 ')).toBe('으로');
  });
});
