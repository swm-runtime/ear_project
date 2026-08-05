import {
  Controller,
  Get,
  HttpStatus,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import {
  ApiErrorResponse,
  AllExceptionsFilter,
} from '@/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import {
  TRACE_ID_HEADER,
  traceIdMiddleware,
} from '@/common/middlewares/trace-id.middleware';
import { HealthModule } from '@/modules/health/health.module';

/** 에러 변환 경로를 확인하기 위한 테스트 전용 컨트롤러 */
@Controller('test-errors')
class TestErrorController {
  @Get('business')
  throwBusiness(): never {
    throw new BusinessForbiddenException({
      errorCode: ErrorCode.FORBIDDEN,
      message: '접근 권한이 없어요',
      logLevel: 'info',
    });
  }

  @Get('unexpected')
  throwUnexpected(): never {
    throw new Error('users 테이블 조회 실패: password=secret');
  }
}

describe('에러 응답 규격', () => {
  let app: INestApplication<App>;

  const get = (path: string) => request(app.getHttpServer()).get(path);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
      controllers: [TestErrorController],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(traceIdMiddleware);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('정상 응답에도 X-Trace-Id 헤더가 포함된다', async () => {
    // given
    // when
    const response = await get('/api/v1/health');

    // then
    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers[TRACE_ID_HEADER.toLowerCase()]).toBeDefined();
  });

  it('도메인 예외를 던지면 error_code와 retryable이 그대로 내려간다', async () => {
    // given
    // when
    const response = await get('/api/v1/test-errors/business');
    const body = response.body as ApiErrorResponse;

    // then
    expect(response.status).toBe(HttpStatus.FORBIDDEN);
    expect(body).toMatchObject({
      error_code: ErrorCode.FORBIDDEN,
      message: '접근 권한이 없어요',
      retryable: false,
      retry_after_sec: null,
    });
    expect(body.trace_id).toEqual(expect.any(String));
  });

  it('예상하지 못한 예외는 내부 사유를 노출하지 않고 INTERNAL_ERROR로 고정된다', async () => {
    // given
    // when
    const response = await get('/api/v1/test-errors/unexpected');
    const body = response.body as ApiErrorResponse;

    // then
    expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.error_code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(body.message).not.toContain('password');
    expect(body.message).not.toContain('users');
  });

  it('없는 경로는 에러 응답 규격으로 404를 반환한다', async () => {
    // given
    // when
    const response = await get('/api/v1/not-exists');
    const body = response.body as ApiErrorResponse;

    // then
    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(body.error_code).toBe(ErrorCode.NOT_FOUND);
  });
});
