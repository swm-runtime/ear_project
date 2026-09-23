import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { AllExceptionsFilter } from './all-exceptions.filter';

jest.mock('@sentry/nestjs', () => ({
  withScope: jest.fn((cb: (scope: unknown) => void) => cb(scopeMock)),
  captureException: jest.fn(),
}));

const scopeMock = { setTag: jest.fn(), setContext: jest.fn() };

/**
 * **error 등급만 Sentry 로 간다**를 못 박는다.
 *
 * 4xx 업무 예외(한도 초과·권한 없음)는 정상 흐름이라 보내면 잡음이 되고 무료 할당량을
 * 앱 크래시 대신 갉아먹는다. 판정은 `BusinessException.logLevel` 이 하고 필터는 그 결과를
 * 따른다 — 이 경계가 조용히 넓어지는 것을 테스트로 막는다.
 */
function host(traceId = 'trace-1', headersSent = false) {
  const request = { method: 'GET', url: '/api/v1/x?signature=SECRET', traceId };
  const response = {
    headersSent,
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return {
    host: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost,
    response,
  };
}

describe('AllExceptionsFilter — Sentry 보고 경계', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'log').mockImplementation(() => undefined);
  });

  it('예상 못한 예외(500)는 Sentry 로 보내고 error_code·http_status 태그를 단다', () => {
    const { host: h, response } = host();
    const boom = new Error('boom');

    filter.catch(boom, h);

    expect(Sentry.captureException).toHaveBeenCalledWith(boom);
    expect(scopeMock.setTag).toHaveBeenCalledWith(
      'error_code',
      ErrorCode.INTERNAL_ERROR,
    );
    expect(scopeMock.setTag).toHaveBeenCalledWith('http_status', '500');
    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('context 의 경로는 로그와 같은 규칙으로 서명을 가린다', () => {
    filter.catch(new Error('boom'), host().host);

    const [, ctx] = scopeMock.setContext.mock.calls[0] as [
      string,
      { path: string; trace_id: string },
    ];
    expect(ctx.path).toContain('signature=[redacted]');
    expect(ctx.path).not.toContain('SECRET');
    expect(ctx.trace_id).toBe('trace-1');
  });

  it('**4xx 업무 예외는 보내지 않는다** — 한도 초과는 정상 흐름이다', () => {
    filter.catch(
      new BusinessException({
        status: HttpStatus.FORBIDDEN,
        errorCode: ErrorCode.PLAY_LIMIT_REACHED,
        message: '오늘 들을 수 있는 횟수를 다 썼어요',
      }),
      host().host,
    );

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('프레임워크 4xx(404 등)도 보내지 않는다', () => {
    filter.catch(new HttpException('nope', HttpStatus.NOT_FOUND), host().host);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('업무 예외라도 logLevel 이 error 면 보낸다 — 등급이 기준이지 타입이 기준이 아니다', () => {
    const e = new BusinessException({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: '탈퇴 처리 중 오류',
      logLevel: 'error',
    });

    filter.catch(e, host().host);

    expect(Sentry.captureException).toHaveBeenCalledWith(e);
  });

  it('응답이 이미 나갔으면 보내지도, 다시 쓰지도 않는다', () => {
    const { host: h, response } = host('t', true);

    filter.catch(new Error('late'), h);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });
});
