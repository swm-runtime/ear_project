import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { of } from 'rxjs';

import { LoggingInterceptor } from './logging.interceptor';

function buildContext(url: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url, headers: {} }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

const NEXT: CallHandler = { handle: () => of(null) };

/**
 * convention.md 8.4 — 서명 URL 전문은 어떤 레벨에서도 로그에 남기지 않는다.
 * 쿼리를 포함한 `request.url`을 그대로 남기면 스트리밍 요청에서 그 규칙이 깨진다.
 */
describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logged: Record<string, unknown>[];

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    logged = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((_message: unknown, fields: unknown) => {
        logged.push(fields as Record<string, unknown>);
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('스트리밍 요청의 서명 값을 가리고 남긴다', (done) => {
    // given — 서명이 로그에 남으면 TTL 안에 재사용할 수 있는 우회 경로가 된다
    const url =
      '/api/v1/audio/abc?user=11111111-1111-4111-8111-111111111111&expires=1786000000&signature=deadbeefcafe';

    // when
    interceptor.intercept(buildContext(url), NEXT).subscribe({
      complete: () => {
        // then — 값만 가리고 키는 남긴다. 다른 파라미터는 그대로다
        const path = logged[0].path as string;
        expect(path).not.toContain('deadbeefcafe');
        expect(path).toContain('signature=[redacted]');
        expect(path).toContain('expires=1786000000');
        done();
      },
    });
  });

  it('쿼리가 없는 요청은 그대로 남긴다', (done) => {
    // given
    const url = '/api/v1/users/me/settings';

    // when
    interceptor.intercept(buildContext(url), NEXT).subscribe({
      complete: () => {
        // then
        expect(logged[0].path).toBe(url);
        done();
      },
    });
  });

  it('민감하지 않은 쿼리는 가리지 않는다', (done) => {
    // given — 진단 가치가 있는 값(플랫폼·버전 등)은 남아야 한다
    const url = '/api/v1/users/me/settings?app_version=1.0.0&platform=android';

    // when
    interceptor.intercept(buildContext(url), NEXT).subscribe({
      complete: () => {
        // then
        expect(logged[0].path).toBe(url);
        done();
      },
    });
  });
});
