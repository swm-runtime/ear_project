import { describe, expect, it } from '@jest/globals';

import { parsePushData, parsePushDeepLink } from './push-link';

describe('parsePushDeepLink', () => {
  it('ear://library 는 라이브러리다', () => {
    expect(parsePushDeepLink('ear://library')).toEqual({ kind: 'library' });
    expect(parsePushDeepLink('ear://library/')).toEqual({ kind: 'library' });
  });

  it('ear://contents/:id 는 그 콘텐츠다', () => {
    expect(parsePushDeepLink('ear://contents/content-7')).toEqual({
      kind: 'content',
      contentId: 'content-7',
    });
    expect(parsePushDeepLink('ear://contents/content-7?utm=x')).toEqual({
      kind: 'content',
      contentId: 'content-7',
    });
  });

  it('모르는 형식은 null 이다', () => {
    expect(parsePushDeepLink('ear://contents/')).toBeNull();
    expect(parsePushDeepLink('ear://contents/a/b')).toBeNull();
    expect(parsePushDeepLink('ear://settings')).toBeNull();
    expect(parsePushDeepLink('https://earcast.co.kr/contents/1')).toBeNull();
    expect(parsePushDeepLink(undefined)).toBeNull();
    expect(parsePushDeepLink(3)).toBeNull();
  });
});

describe('parsePushData', () => {
  it('drip_arrival 의 목적지와 편수를 읽는다', () => {
    expect(
      parsePushData({ type: 'drip_arrival', deep_link: 'ear://contents/c1', content_count: 1 }),
    ).toEqual({ target: { kind: 'content', contentId: 'c1' }, contentCount: 1 });
    expect(
      parsePushData({ type: 'drip_arrival', deep_link: 'ear://library', content_count: '3' }),
    ).toEqual({ target: { kind: 'library' }, contentCount: 3 });
  });

  it('목적지를 못 읽으면 라이브러리로 보낸다', () => {
    expect(parsePushData({ type: 'drip_arrival', deep_link: 'ear://unknown' })).toEqual({
      target: { kind: 'library' },
      contentCount: null,
    });
  });

  it('우리 알림이 아니면 null 이다', () => {
    expect(parsePushData({ type: 'marketing', deep_link: 'ear://library' })).toBeNull();
    expect(parsePushData(null)).toBeNull();
    expect(parsePushData('drip_arrival')).toBeNull();
  });
});
