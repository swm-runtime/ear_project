import { afterEach, describe, expect, it, jest } from '@jest/globals';

afterEach(() => {
  jest.resetModules();
});

describe('Meta 광고 ID 플랫폼 경계', () => {
  it.each([
    ['android', false, true],
    ['ios', false, false],
    ['android', true, null],
    ['web', false, null],
  ])('%s / 개발계 %s 초기화 정책을 지킨다', async (os, dev, expected) => {
    jest.resetModules();
    const calls: string[] = [];
    const setId = jest.fn((enabled: boolean) => {
      calls.push(`id:${enabled}`);
    });
    const initialize = jest.fn(() => {
      calls.push('initialize');
    });
    const logEvent = jest.fn(() => {
      calls.push('event');
    });
    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    jest.doMock('@/shared/lib/app-version', () => ({ IS_DEV_API: dev }));
    jest.doMock('@/shared/lib/logger', () => ({ logger: { warn: jest.fn() } }));
    jest.doMock('@/shared/storage/secure-storage', () => ({ secureStorage: {} }));
    jest.doMock(
      'react-native-fbsdk-next',
      () => ({
        Settings: {
          setAdvertiserIDCollectionEnabled: setId,
          setAutoLogAppEventsEnabled: jest.fn(),
          initializeSDK: initialize,
        },
        AppEventsLogger: { logEvent },
      }),
      { virtual: true },
    );
    const { forwardToMeta } = jest.requireActual<typeof import('./meta')>('./meta');
    const status = await forwardToMeta('onboarding_complete', {
      topic_count: 1,
      career_filled: false,
      picked_count: 1,
      elapsed_sec: 10,
    });
    if (expected === null) {
      expect(status).toBe('stubbed');
      expect(setId).not.toHaveBeenCalled();
      expect(initialize).not.toHaveBeenCalled();
      expect(logEvent).not.toHaveBeenCalled();
    } else {
      expect(status).toBe('sent');
      expect(setId).toHaveBeenCalledWith(expected);
      expect(calls).toEqual([`id:${expected}`, 'initialize', 'event']);
    }
  });
});
