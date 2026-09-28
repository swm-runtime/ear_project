import { redactSensitiveQuery } from './redact-url.util';

/**
 * 마스킹 대상 목록은 이 유틸 한 곳이 소유한다(convention.md 8.4). 목록에서 키가 빠지면
 * LoggingInterceptor·AllExceptionsFilter 양쪽이 동시에 새므로, 여기서 키마다 고정한다.
 */
describe('redactSensitiveQuery — 민감 쿼리 값만 가린다', () => {
  it('오디오 서명 URL의 signature 값을 가리고 키는 남긴다', () => {
    expect(
      redactSensitiveQuery(
        '/api/v1/contents/abc/audio?expires=1&signature=SECRET',
      ),
    ).toBe('/api/v1/contents/abc/audio?expires=1&signature=[redacted]');
  });

  it('편성 미리보기의 email 값을 가린다 — 이메일 원문은 로그에 남지 않는다', () => {
    expect(
      redactSensitiveQuery(
        '/api/v1/admin/drip/preview?email=someone%40example.com',
      ),
    ).toBe('/api/v1/admin/drip/preview?email=[redacted]');
  });

  it('첫 파라미터가 아니어도, 여러 개여도 전부 가린다', () => {
    expect(redactSensitiveQuery('/x?a=1&email=u%40e.com&signature=S&b=2')).toBe(
      '/x?a=1&email=[redacted]&signature=[redacted]&b=2',
    );
  });

  it('쿼리가 없거나 대상 키가 없으면 그대로 돌려준다', () => {
    expect(redactSensitiveQuery('/api/v1/health')).toBe('/api/v1/health');
    expect(redactSensitiveQuery('/x?page=2&limit=20')).toBe(
      '/x?page=2&limit=20',
    );
  });

  it('키 이름이 부분 일치하는 다른 파라미터는 건드리지 않는다', () => {
    expect(redactSensitiveQuery('/x?user_email_hint=1&emails=2')).toBe(
      '/x?user_email_hint=1&emails=2',
    );
  });
});
