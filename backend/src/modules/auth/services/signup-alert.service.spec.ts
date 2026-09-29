import { formatSignupText, resolveWebhookUrl } from './signup-alert.service';

/** 알림 문구 — 채널에 그대로 찍히는 값이라 모양과 **담기지 않는 것**을 함께 고정한다 */
describe('formatSignupText', () => {
  // 2026-09-29 05:03 UTC = 14:03 KST
  const at = new Date('2026-09-29T05:03:00Z');

  it('제공자를 한국어로 적는다', () => {
    expect(formatSignupText('kakao', at)).toContain('카카오');
    expect(formatSignupText('google', at)).toContain('구글');
    expect(formatSignupText('naver', at)).toContain('네이버');
    expect(formatSignupText('apple', at)).toContain('애플');
  });

  it('서버가 UTC 라도 시각은 KST 로 적는다', () => {
    expect(formatSignupText('kakao', at)).toContain('14:03');
  });

  it('모르는 제공자는 원값을 쓴다 — 조용히 비는 것보다 낫다', () => {
    expect(formatSignupText('dev', at)).toContain('dev');
  });

  it('운영이 아니면 환경을 앞에 붙인다 — 같은 웹훅을 개발계에 넣어도 섞이지 않는다', () => {
    expect(formatSignupText('kakao', at, 'development')).toMatch(
      /^\[development\] /,
    );
  });

  it('운영에는 아무 표시도 붙지 않는다 — 대부분의 줄이 운영이라 없는 쪽이 기본이어야 읽힌다', () => {
    expect(formatSignupText('kakao', at, 'production')).toMatch(/^:wave:/);
    expect(formatSignupText('kakao', at, '')).toMatch(/^:wave:/);
    expect(formatSignupText('kakao', at)).toMatch(/^:wave:/);
  });

  it('신원 값을 담지 않는다 — 제공자와 시각뿐이다', () => {
    const text = formatSignupText('kakao', at);
    expect(text).not.toMatch(/@|user_id|[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(text.split(' · ')).toHaveLength(3);
  });
});

/** 웹훅 선택 — 기본은 기존 알림 채널이다(채널을 새로 만들지 않는다) */
describe('resolveWebhookUrl', () => {
  it('전용 웹훅이 있으면 그것을 쓴다', () => {
    expect(resolveWebhookUrl('https://signup', 'https://error')).toBe(
      'https://signup',
    );
  });

  it('전용 웹훅이 없으면 기존 알림 채널로 보낸다 — env 를 안 건드려도 켜진다', () => {
    expect(resolveWebhookUrl(undefined, 'https://error')).toBe('https://error');
    expect(resolveWebhookUrl('', 'https://error')).toBe('https://error');
  });

  it('공백만 있는 값은 없는 것으로 본다 — env 를 지우는 대신 비워 두는 일이 흔하다', () => {
    expect(resolveWebhookUrl('   ', 'https://error')).toBe('https://error');
    expect(resolveWebhookUrl('   ', '  ')).toBe('');
  });

  it('둘 다 없으면 꺼진다', () => {
    expect(resolveWebhookUrl()).toBe('');
  });
});
