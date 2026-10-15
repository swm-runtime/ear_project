import { describe, expect, it } from '@jest/globals';

import { providersFor } from './start-providers';

describe('providersFor — A1 제공자 목록(로그인 전이라 표시 언어로 거른다)', () => {
  it('한국어 표시는 네 제공자 전부, 종전 순서 그대로', () => {
    expect(providersFor('ko')).toEqual(['naver', 'kakao', 'google', 'apple']);
  });

  it('영어 표시는 Google·Apple 만', () => {
    expect(providersFor('en')).toEqual(['google', 'apple']);
  });
});
