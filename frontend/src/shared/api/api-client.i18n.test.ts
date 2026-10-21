import { describe, expect, it, jest } from '@jest/globals';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

import { apiClient } from './api-client';
import { isApiError } from './api-error';

/**
 * 요청 헤더·영어 에러 문구(KAN-194 — `global-api.md` 2.2·2.3). 기기 로캘을 영어(미국 동부)로 고정해 확인한다
 * (jest.mock 은 import 위로 끌어올려져 api-client 가 이 로캘로 뜬다)
 */
jest.mock('@/shared/i18n/locale', () => ({
  APP_LANGUAGE: 'en',
  DEVICE_LOCALE: 'en-US',
  DISPLAY_LOCALE: 'en-US',
  DEVICE_TIMEZONE: 'America/New_York',
  toAppLanguage: () => 'en',
}));

const respondWith = (
  handler: (config: InternalAxiosRequestConfig) => Promise<unknown>,
): jest.Mock<(config: InternalAxiosRequestConfig) => Promise<unknown>> => {
  const adapter = jest.fn(handler);
  apiClient.defaults.adapter = adapter as never;
  return adapter;
};

describe('apiClient — i18n', () => {
  it('모든 요청에 Accept-Language · X-Timezone 을 싣는다', async () => {
    // given
    const adapter = respondWith(async (config) => ({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));

    // when
    await apiClient.get('/ping');

    // then
    const headers = AxiosHeaders.from(adapter.mock.calls[0][0].headers);
    expect(headers.get('Accept-Language')).toBe('en-US');
    expect(headers.get('X-Timezone')).toBe('America/New_York');
  });

  it('영어 표시면 서버의 한국어 message 대신 error_code 의 영어 문구를 쓴다', async () => {
    // given
    respondWith(async (config) => {
      throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
        data: { error_code: 'EMAIL_ALREADY_REGISTERED', message: '이미 등록된 이메일이에요' },
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
      });
    });

    // when
    const error = await apiClient.post('/users/me/email', {}).catch((e: unknown) => e);

    // then
    expect(isApiError(error)).toBe(true);
    expect((error as Error).message).toBe('This email is already registered.');
  });
});
