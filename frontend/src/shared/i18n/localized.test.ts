import { describe, expect, it } from '@jest/globals';

import { toAppLanguage } from './locale';
import { localized, type LocalizedCopy } from './localized';

describe('toAppLanguage — 기기 로캘 → 표시 언어', () => {
  it('한국어 로캘만 ko, 나머지는 en', () => {
    expect(toAppLanguage('ko-KR')).toBe('ko');
    expect(toAppLanguage('ko')).toBe('ko');
    expect(toAppLanguage('en-US')).toBe('en');
    expect(toAppLanguage('ja-JP')).toBe('en');
  });
});

describe('localized — 표시 언어의 카피를 고른다', () => {
  const ko = { title: '설정', count: (n: number) => `${n}개` } as const;
  const en: LocalizedCopy<typeof ko> = {
    title: 'Settings',
    count: (n) => `${n} ${n === 1 ? 'item' : 'items'}`,
  };

  it('ko 면 한국어 객체를 그대로 돌려준다(종전 문구와 1:1)', () => {
    expect(localized({ ko, en }, 'ko')).toBe(ko);
  });

  it('en 이면 같은 모양의 영어 카피', () => {
    const copy = localized({ ko, en }, 'en');
    expect(copy.title).toBe('Settings');
    expect(copy.count(1)).toBe('1 item');
    expect(copy.count(3)).toBe('3 items');
  });
});
