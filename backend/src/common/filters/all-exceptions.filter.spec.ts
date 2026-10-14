import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
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
function host(
  traceId = 'trace-1',
  headersSent = false,
  user?: { id: string; role: string; market: string },
) {
  const request = {
    method: 'GET',
    url: '/api/v1/x?signature=SECRET',
    traceId,
    user,
  };
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

  it('로그인한 요청의 오류에는 market 태그를 단다 — 시장별 오류율(KAN-193)', () => {
    // given
    const { host: h } = host('trace-1', false, {
      id: 'user-1',
      role: 'user',
      market: 'global',
    });

    // when
    filter.catch(new Error('boom'), h);

    // then
    expect(scopeMock.setTag).toHaveBeenCalledWith('market', 'global');
  });

  it('시장을 모르는 요청(비로그인)에는 market 태그를 달지 않는다', () => {
    // given — 기본 host 는 user 가 없다(비로그인)

    // when
    filter.catch(new Error('boom'), host().host);

    // then
    expect(scopeMock.setTag).not.toHaveBeenCalledWith(
      'market',
      expect.anything(),
    );
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

  it('body-parser 오류(entity.too.large)는 413 으로 답하고 warn 만 남긴다 — 500 ERROR 로 뭉개지 않는다', () => {
    const { host: h, response } = host();
    const error = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
    });

    filter.catch(error, h);

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error_code: 'VALIDATION_FAILED',
        retryable: false,
      }),
    );
    expect(filter['logger'].error).not.toHaveBeenCalled();
    expect(filter['logger'].warn).toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('클라이언트가 전송 중 끊은 요청(raw-body request.aborted)은 400 으로 답하고 info 로만 남기며 Sentry 로 보내지 않는다', () => {
    const { host: h, response } = host();
    const error = Object.assign(new Error('request aborted'), {
      type: 'request.aborted',
      code: 'ECONNABORTED',
      status: 400,
      expected: 120,
      received: 48,
    });

    filter.catch(error, h);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error_code: 'VALIDATION_FAILED',
        message: '요청이 중단됐어요',
        retryable: true,
      }),
    );
    expect(filter['logger'].error).not.toHaveBeenCalled();
    expect(filter['logger'].warn).not.toHaveBeenCalled();
    expect(filter['logger'].log).toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it.each([
    ['charset.unsupported', 415],
    ['encoding.unsupported', 415],
    ['parameters.too.many', 413],
    ['request.size.invalid', 400],
    ['querystring.parse.rangeError', 400],
  ])(
    'entity.* 밖의 body-parser 클라이언트 오류(%s)도 그 상태(%i)로 답하고 warn 만 남긴다',
    (type, status) => {
      const { host: h, response } = host();
      const error = Object.assign(new Error('body parse failed'), {
        type,
        status,
      });

      filter.catch(error, h);

      expect(response.status).toHaveBeenCalledWith(status);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error_code: 'VALIDATION_FAILED',
          retryable: false,
        }),
      );
      expect(filter['logger'].error).not.toHaveBeenCalled();
      expect(filter['logger'].warn).toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    },
  );

  it('body-parser 가 아닌 Error 는 숫자 status 가 있어도 500 으로 남기고 Sentry 로 보낸다', () => {
    // given — 외부 HTTP 클라이언트 오류처럼 상대 서버의 상태를 실은 Error
    const { host: h, response } = host();
    const error = Object.assign(new Error('upstream not found'), {
      status: 404,
    });

    // when
    filter.catch(error, h);

    // then — 우리 서버의 실패가 404 로 둔갑하지 않는다
    expect(response.status).toHaveBeenCalledWith(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('body-parser 의 서버 쪽 스트림 오류(stream.*, 500)는 그대로 500 ERROR 다', () => {
    const { host: h, response } = host();
    const error = Object.assign(new Error('stream is not readable'), {
      type: 'stream.not.readable',
      status: 500,
    });

    filter.catch(error, h);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
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

/**
 * convention.md 8.4 — 요청 바디·서명·이메일·비밀 주소는 로그에 남기지 않는다.
 * `path` 필드만 가리고 **메시지**로 같은 값이 새는 경로를 막는다.
 */
describe('AllExceptionsFilter — warn 메시지에 요청 값이 섞이지 않는다', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'log').mockImplementation(() => undefined);
  });

  function warnedMessage(): string {
    const calls = (filter['logger'].warn as jest.Mock).mock.calls as [
      string,
      unknown,
    ][];
    expect(calls).toHaveLength(1);
    return calls[0][0];
  }

  it('JSON 파싱 실패는 본문 조각이 담긴 SyntaxError 문구 대신 오류 type 만 남긴다', () => {
    // body-parser 가 JSON.parse 의 메시지를 그대로 옮긴다 — V8 은 본문 앞부분을 메시지에 싣는다
    const body = 'email=user@example.com&code=123456';
    let parseError = new Error('unreachable');
    try {
      JSON.parse(body);
    } catch (error) {
      parseError = error as Error;
    }
    expect(parseError.message).toContain('email=user');
    const error = Object.assign(parseError, {
      type: 'entity.parse.failed',
      status: 400,
      body,
    });

    filter.catch(error, host().host);

    expect(warnedMessage()).toBe('entity.parse.failed');
  });

  it('라우터 404 문구의 URL 은 서명·이메일 쿼리와 Sentry 웹훅 토큰 경로를 가린다', () => {
    // `@nestjs/core` routes-resolver 가 `Cannot ${method} ${originalUrl}` 로 던진다
    filter.catch(
      new NotFoundException(
        'Cannot GET /api/v1/webhooks/sentry/HOOK_TOKEN?email=user@example.com&signature=SIG',
      ),
      host().host,
    );

    expect(warnedMessage()).toBe(
      'Cannot GET /api/v1/webhooks/sentry/[redacted]?email=[redacted]&signature=[redacted]',
    );
  });

  it('그 밖의 프레임워크 4xx 문구는 그대로 남긴다', () => {
    filter.catch(new NotFoundException(), host().host);

    expect(warnedMessage()).toBe('Not Found');
  });
});
