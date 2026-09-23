import type { ErrorEvent } from '@sentry/nestjs';

import { scrubEvent } from './sentry-scrub';

/**
 * convention.md 8장 — 토큰·인증 코드·이메일 원문·요청 바디를 남기지 않는다.
 * Sentry 는 외부 서비스라 이 규칙이 더 엄하게 걸린다. 기본 설정이면 전부 나가므로
 * 테스트로 못 박는다.
 */
function event(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    request: {
      method: 'POST',
      url: 'https://api.earcast.co.kr/api/v1/auth/sign-up',
      data: { email: 'user@example.com', code: '123456' },
      headers: { authorization: 'Bearer secret', cookie: 'session=abc' },
      cookies: { session: 'abc' },
    },
    ...overrides,
  } as ErrorEvent;
}

describe('scrubEvent — Sentry 로 나가기 전 세탁', () => {
  it('요청 바디를 지운다 — 가입 폼·인증 코드가 전부 여기로 들어온다', () => {
    expect(scrubEvent(event()).request?.data).toBeUndefined();
  });

  it('헤더와 쿠키를 지운다 — Authorization 토큰이 그대로 나간다', () => {
    const scrubbed = scrubEvent(event());

    expect(scrubbed.request?.headers).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
  });

  it('**서명 쿼리는 값만 가리고 경로는 남긴다** — 어느 엔드포인트였는지는 진단에 필요하다', () => {
    const scrubbed = scrubEvent(
      event({
        request: {
          url: 'https://cdn.example/play/abc?signature=SECRET&Expires=1',
        },
      }),
    );

    expect(scrubbed.request?.url).toContain('/play/abc');
    expect(scrubbed.request?.url).not.toContain('SECRET');
    expect(scrubbed.request?.url).toContain('signature=[redacted]');
  });

  it('사용자는 id 만 남긴다 — 이메일·이름·IP 는 보내지 않는다', () => {
    const scrubbed = scrubEvent(
      event({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          username: '홍길동',
          ip_address: '1.2.3.4',
        },
      }),
    );

    expect(scrubbed.user).toEqual({ id: 'user-1' });
  });

  it('id 조차 없으면 사용자 정보를 통째로 비운다', () => {
    const scrubbed = scrubEvent(event({ user: { email: 'user@example.com' } }));

    expect(scrubbed.user).toEqual({});
  });

  it('breadcrumb 의 URL 도 같은 규칙으로 가린다', () => {
    const scrubbed = scrubEvent(
      event({
        breadcrumbs: [
          { data: { url: 'https://cdn.example/a?signature=SECRET' } },
        ],
      }),
    );

    expect(scrubbed.breadcrumbs?.[0].data?.url).not.toContain('SECRET');
  });

  it('request 가 없는 이벤트(스케줄러·부팅 실패)도 그대로 통과한다', () => {
    expect(() => scrubEvent({} as ErrorEvent)).not.toThrow();
  });
});
