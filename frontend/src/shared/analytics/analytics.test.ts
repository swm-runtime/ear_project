import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  getAnalyticsDebugLog,
  sanitizeParams,
  setAnalyticsUser,
  setAnalyticsUserProperties,
  track,
} from './analytics';

// 네이티브 모듈이 없는 환경 — SDK 는 동적 로드라 stub 만 있으면 된다
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  // 실제 SHA-256 처럼 64자 hex — 입력이 그대로 드러나지 않는다
  digestStringAsync: async () => '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
}));
jest.mock('@/shared/lib/app-version', () => ({
  IS_DEV_API: true,
  resolveBundleLabel: () => '내장',
}));
// Meta 전달(meta.ts)은 개발계(IS_DEV_API)에서 스텁이지만 모듈이 저장소를 import 한다 — 네이티브 SecureStore 대신 메모리
jest.mock('@/shared/storage/secure-storage', () => {
  const memory = new Map<string, string>();
  return {
    secureStorage: {
      get: async (key: string) => memory.get(key) ?? null,
      set: async (key: string, value: string) => {
        memory.set(key, value);
      },
      remove: async (key: string) => {
        memory.delete(key);
      },
    },
  };
});

const mockLogEvent = jest.fn(async () => undefined);
const mockSetUserId = jest.fn(async () => undefined);
const mockSetUserProperties = jest.fn(async () => undefined);
jest.mock(
  '@react-native-firebase/analytics',
  () => ({
    getAnalytics: () => ({}),
    logEvent: (...args: unknown[]) => mockLogEvent(...(args as [])),
    setUserId: (...args: unknown[]) => mockSetUserId(...(args as [])),
    setUserProperties: (...args: unknown[]) => mockSetUserProperties(...(args as [])),
    logScreenView: async () => undefined,
  }),
  { virtual: true },
);

/** 발송은 fire-and-forget 이라 마이크로태스크가 비워질 때까지 기다린다 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockLogEvent.mockClear();
  mockSetUserId.mockClear();
  mockSetUserProperties.mockClear();
});

describe('sanitizeParams — Firebase 가 확실히 받는 타입으로 고정', () => {
  it('불리언은 문자열 true/false 가 된다 — Android Bundle 은 불리언 파라미터를 버린다', () => {
    expect(sanitizeParams({ resumed: true, career_filled: false })).toEqual({
      resumed: 'true',
      career_filled: 'false',
    });
  });

  it('문자열·유한 숫자는 그대로, 100자 넘는 문자열은 자른다', () => {
    const long = 'x'.repeat(120);
    expect(sanitizeParams({ content_id: 'c1', percent: 25, s: long })).toEqual({
      content_id: 'c1',
      percent: 25,
      s: 'x'.repeat(100),
    });
  });

  it('undefined·null·NaN·객체는 뺀다 — 값이 없는 키를 보내 이벤트가 통째로 거부되지 않게', () => {
    expect(
      sanitizeParams({ a: undefined, b: null, c: Number.NaN, d: { x: 1 }, e: 'ok' }),
    ).toEqual({ e: 'ok' });
  });
});

describe('track — 공통 파라미터와 발송 기록', () => {
  it('app_variant·bundle_label 이 자동으로 붙고 디버그 기록이 sent 로 남는다', async () => {
    track('play_progress', { content_id: 'c1', percent: 50 });
    await flush();
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    const [, name, params] = mockLogEvent.mock.calls[0] as unknown as [unknown, string, object];
    expect(name).toBe('play_progress');
    expect(params).toEqual({
      app_variant: 'dev',
      bundle_label: 'embedded',
      content_id: 'c1',
      percent: 50,
    });
    expect(getAnalyticsDebugLog()[0]).toMatchObject({ label: 'play_progress', status: 'sent' });
  });

  it('SDK 가 던지면 failed 와 사유가 기록되고 앱에는 던지지 않는다', async () => {
    mockLogEvent.mockImplementationOnce(async () => {
      throw new Error('boom: invalid');
    });
    expect(() => track('logout', {})).not.toThrow();
    await flush();
    expect(getAnalyticsDebugLog()[0]).toMatchObject({
      label: 'logout',
      status: 'failed',
      reason: 'Error: boom: invalid',
    });
  });
});

describe('setAnalyticsUser — 완료 조건 5: 앞 사용자의 속성이 다음 사용자에게 넘어가지 않는다', () => {
  it('로그인은 서버 id 의 해시 앞 16자를 user_id 로 쓴다 — 원본 id 는 보내지 않는다', async () => {
    setAnalyticsUser('user-42');
    await flush();
    expect(mockSetUserId).toHaveBeenCalledTimes(1);
    const [, id] = mockSetUserId.mock.calls[0] as unknown as [unknown, string];
    expect(id).toBe('9f86d081884c7d65');
  });

  it('로그아웃(null)은 user_id 를 지우고 tier·topic_count·push_permission 을 전부 null 로 비운다', async () => {
    setAnalyticsUser(null);
    await flush();
    expect(mockSetUserId).toHaveBeenCalledWith(expect.anything(), null);
    expect(mockSetUserProperties).toHaveBeenCalledWith(expect.anything(), {
      tier: null,
      topic_count: null,
      push_permission: null,
    });
  });

  it('속성은 문자열로 바꿔 보내고 undefined 는 뺀다', async () => {
    setAnalyticsUserProperties({ topic_count: 3, tier: undefined });
    await flush();
    expect(mockSetUserProperties).toHaveBeenCalledWith(expect.anything(), { topic_count: '3' });
  });
});
