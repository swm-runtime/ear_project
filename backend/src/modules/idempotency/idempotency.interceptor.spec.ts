import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { IDEMPOTENCY_KEY_MAX_LENGTH } from './idempotency.constant';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

/**
 * 인터셉터의 **키 형식 검사**만 본다. 저장·재생 동작은 `idempotency.service.spec.ts`와 e2e가 맡는다.
 */
function buildContext(idempotencyKey: string | undefined): ExecutionContext {
  const request = {
    method: 'POST',
    baseUrl: '',
    path: '/api/v1/onboarding/picks',
    route: { path: '/api/v1/onboarding/picks' },
    params: {},
    body: {},
    user: { id: 'user-1' },
    header: (name: string) =>
      name === 'Idempotency-Key' ? idempotencyKey : undefined,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getHandler: () => () => undefined,
  } as unknown as ExecutionContext;
}

describe('IdempotencyInterceptor', () => {
  let begin: jest.Mock;
  let interceptor: IdempotencyInterceptor;
  const next: CallHandler = { handle: () => of({ ok: true }) };

  beforeEach(() => {
    begin = jest.fn(() => Promise.resolve({ type: 'started', id: 'row-1' }));
    interceptor = new IdempotencyInterceptor({
      begin,
      complete: jest.fn(() => Promise.resolve()),
      discard: jest.fn(() => Promise.resolve()),
    } as unknown as IdempotencyService);
  });

  it('키가 없으면 400 VALIDATION_FAILED로 거절한다', async () => {
    // given / when
    const intercepting = interceptor.intercept(buildContext(undefined), next);

    // then
    await expect(intercepting).rejects.toMatchObject({
      errorCode: ErrorCode.VALIDATION_FAILED,
    });
    expect(begin).not.toHaveBeenCalled();
  });

  it('키가 컬럼 길이(255자)를 넘으면 저장하지 않고 400 VALIDATION_FAILED로 거절한다', async () => {
    // given — 넘기면 INSERT가 Postgres 22001로 깨져 500이 됐다(2026-09-26 감사 하 #6)
    const tooLong = 'k'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1);

    // when
    const intercepting = interceptor.intercept(buildContext(tooLong), next);

    // then
    await expect(intercepting).rejects.toMatchObject({
      errorCode: ErrorCode.VALIDATION_FAILED,
    });
    expect(begin).not.toHaveBeenCalled();
  });

  it('키가 정확히 255자면 받아들인다', async () => {
    // given
    const atLimit = 'k'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH);

    // when
    await interceptor.intercept(buildContext(atLimit), next);

    // then
    expect(begin).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: atLimit }),
      expect.any(Date),
    );
  });
});
