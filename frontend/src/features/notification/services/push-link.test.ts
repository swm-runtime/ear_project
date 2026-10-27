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
    ).toEqual({
      type: 'drip_arrival',
      target: { kind: 'content', contentId: 'c1' },
      contentCount: 1,
      rule: null,
    });
    expect(
      parsePushData({ type: 'drip_arrival', deep_link: 'ear://library', content_count: '3' }),
    ).toEqual({ type: 'drip_arrival', target: { kind: 'library' }, contentCount: 3, rule: null });
  });

  it('목적지를 못 읽으면 라이브러리로 보낸다', () => {
    expect(parsePushData({ type: 'drip_arrival', deep_link: 'ear://unknown' })).toEqual({
      type: 'drip_arrival',
      target: { kind: 'library' },
      contentCount: null,
      rule: null,
    });
  });

  it('리텐션 알림의 규칙·변형과 목적지를 읽는다(notification.md 4.6)', () => {
    expect(
      parsePushData({ type: 'retention.resume_content.a', deep_link: 'ear://contents/c9' }),
    ).toEqual({
      type: 'retention',
      target: { kind: 'content', contentId: 'c9' },
      contentCount: null,
      rule: 'resume_content.a',
    });
    expect(
      parsePushData({ type: 'retention.weekly_rank_gap.b', deep_link: 'ear://library' }),
    ).toEqual({
      type: 'retention',
      target: { kind: 'library' },
      contentCount: null,
      rule: 'weekly_rank_gap.b',
    });
  });

  it('리텐션도 목적지를 못 읽으면 라이브러리로 보낸다', () => {
    expect(parsePushData({ type: 'retention.streak_keep.a' })).toEqual({
      type: 'retention',
      target: { kind: 'library' },
      contentCount: null,
      rule: 'streak_keep.a',
    });
  });

  it('우리 알림이 아니면 null 이다', () => {
    expect(parsePushData({ type: 'marketing', deep_link: 'ear://library' })).toBeNull();
    expect(parsePushData({ type: 'retention.', deep_link: 'ear://library' })).toBeNull();
    expect(parsePushData({ type: 'retentionx', deep_link: 'ear://library' })).toBeNull();
    expect(parsePushData(null)).toBeNull();
    expect(parsePushData('drip_arrival')).toBeNull();
  });
});
