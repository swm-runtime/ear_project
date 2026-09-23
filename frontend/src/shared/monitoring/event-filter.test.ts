import { describe, expect, it } from '@jest/globals';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import { isExpectedError, scrubEvent } from './event-filter';

const apiError = (code: string, status: number | null) =>
  new ApiError(code, 'msg', false, null, 'trace', status);

describe('isExpectedError — 보내지 않을 오류 판정', () => {
  it('네트워크 실패·타임아웃은 보내지 않는다', () => {
    expect(isExpectedError(apiError(ERROR_CODES.NETWORK_ERROR, null))).toBe(true);
    expect(isExpectedError(apiError(ERROR_CODES.TIMEOUT, null))).toBe(true);
  });

  it('서버가 계약대로 내려준 4xx 는 보내지 않는다', () => {
    expect(isExpectedError(apiError('PLAY_LIMIT_EXCEEDED', 403))).toBe(true);
    expect(isExpectedError(apiError('UNAUTHORIZED', 401))).toBe(true);
    expect(isExpectedError(apiError('VALIDATION_ERROR', 422))).toBe(true);
  });

  it('5xx 와 상태를 모르는 ApiError 는 보낸다', () => {
    expect(isExpectedError(apiError(ERROR_CODES.INTERNAL_ERROR, 500))).toBe(false);
    expect(isExpectedError(apiError('UNKNOWN', null))).toBe(false);
  });

  it('ApiError 가 아닌 예외는 전부 보낸다', () => {
    expect(isExpectedError(new TypeError('x is undefined'))).toBe(false);
    expect(isExpectedError('string')).toBe(false);
    expect(isExpectedError(undefined)).toBe(false);
  });
});

describe('scrubEvent — 개인정보 제거', () => {
  it('사용자는 id 만 남긴다', () => {
    const event = scrubEvent({ user: { id: 42, email: 'a@b.c', username: 'nick' } });
    expect(event.user).toEqual({ id: '42' });
  });

  it('id 없는 사용자는 빈 객체가 된다', () => {
    expect(scrubEvent({ user: { email: 'a@b.c' } }).user).toEqual({});
  });

  it('breadcrumb URL 의 쿼리를 떼고 요청 정보를 지운다', () => {
    const event = scrubEvent({
      breadcrumbs: [{ data: { url: 'https://api/x?token=abc&code=1' } }, { data: {} }],
      request: { headers: { Authorization: 'Bearer x' } },
    });
    expect(event.breadcrumbs?.[0].data?.url).toBe('https://api/x');
    expect(event.request).toBeUndefined();
  });
});
