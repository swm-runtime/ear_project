import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { forwardToMeta, setMetaUser } from './meta';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
// 운영 변형 — 개발계(IS_DEV_API)에서는 스텁이라 여기선 운영으로 둔다
jest.mock('@/shared/lib/app-version', () => ({
  IS_DEV_API: false,
  resolveBundleLabel: () => '내장',
}));
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

const mockLogEvent = jest.fn();
const mockSetAdvertiserIDCollectionEnabled = jest.fn();
const mockSetAutoLogAppEventsEnabled = jest.fn();
const mockInitializeSDK = jest.fn();
jest.mock(
  'react-native-fbsdk-next',
  () => ({
    AppEventsLogger: {
      logEvent: (...args: unknown[]) => mockLogEvent(...args),
      AppEvents: { CompletedRegistration: 'fb_mobile_complete_registration' },
      AppEventParams: { RegistrationMethod: 'fb_registration_method' },
    },
    Settings: {
      setAdvertiserIDCollectionEnabled: (v: boolean) => mockSetAdvertiserIDCollectionEnabled(v),
      setAutoLogAppEventsEnabled: (v: boolean) => mockSetAutoLogAppEventsEnabled(v),
      initializeSDK: () => mockInitializeSDK(),
    },
  }),
  { virtual: true },
);

beforeEach(() => {
  mockLogEvent.mockClear();
  setMetaUser(null);
});

describe('Meta 광고 측정 — track() 이 고른 이벤트만 넘긴다(KAN-94)', () => {
  it('SDK 를 처음 쓸 때 IDFA 수집을 끄고 자동 이벤트를 켠 채 초기화한다 — ATT 팝업이 없어야 한다', async () => {
    await forwardToMeta('onboarding_complete', { topic_count: 3, career_filled: false, picked_count: 2, elapsed_sec: 40 });
    expect(mockSetAdvertiserIDCollectionEnabled).toHaveBeenCalledWith(false);
    expect(mockSetAutoLogAppEventsEnabled).toHaveBeenCalledWith(true);
    expect(mockInitializeSDK).toHaveBeenCalled();
  });

  it('가입 완료는 표준 이벤트 fb_mobile_complete_registration 에 method 를 붙여 보낸다', async () => {
    const status = await forwardToMeta('sign_up', { method: 'kakao' });
    expect(status).toBe('sent');
    expect(mockLogEvent).toHaveBeenCalledWith('fb_mobile_complete_registration', {
      fb_registration_method: 'kakao',
    });
  });

  it('온보딩 완료는 커스텀 onboarding_complete 로 보낸다', async () => {
    const status = await forwardToMeta('onboarding_complete', {
      topic_count: 3,
      career_filled: true,
      picked_count: 2,
      elapsed_sec: 40,
    });
    expect(status).toBe('sent');
    expect(mockLogEvent).toHaveBeenCalledWith('onboarding_complete');
  });

  it('첫 재생은 계정당 한 번만 first_play — 같은 계정의 두 번째 재생은 보내지 않는다', async () => {
    setMetaUser('user-a-hash');
    const first = await forwardToMeta('play_start', {
      content_id: 'c1',
      entry: 'library',
      origin: 'ai_generated',
      resumed: false,
    });
    const second = await forwardToMeta('play_start', {
      content_id: 'c2',
      entry: 'library',
      origin: 'ai_generated',
      resumed: false,
    });
    expect(first).toBe('sent');
    expect(second).toBe('skipped');
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith('first_play');
  });

  it('다른 계정으로 바꾸면 first_play 를 다시 보낸다 — 로그아웃(null)이면 보내지 않는다', async () => {
    setMetaUser('user-a-hash');
    await forwardToMeta('play_start', {
      content_id: 'c1',
      entry: 'library',
      origin: 'ai_generated',
      resumed: false,
    });
    setMetaUser('user-b-hash');
    const other = await forwardToMeta('play_start', {
      content_id: 'c1',
      entry: 'library',
      origin: 'ai_generated',
      resumed: false,
    });
    setMetaUser(null);
    const loggedOut = await forwardToMeta('play_start', {
      content_id: 'c1',
      entry: 'library',
      origin: 'ai_generated',
      resumed: false,
    });
    expect(other).toBe('sent');
    expect(loggedOut).toBe('skipped');
  });

  it('대상이 아닌 이벤트는 Meta 로 가지 않는다', async () => {
    const status = await forwardToMeta('play_complete', { content_id: 'c1', listen_sec: 600 });
    expect(status).toBe('skipped');
    expect(mockLogEvent).not.toHaveBeenCalled();
  });
});
