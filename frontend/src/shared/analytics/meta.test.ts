import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  forwardToMeta,
  getAdMeasurementAllowed,
  setAdMeasurementAllowed,
  setMetaUser,
} from './meta';

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

describe('광고 측정 허용 토글 — 끄면 Meta 로 보내지 않는다(KAN-217)', () => {
  beforeEach(async () => {
    // 앞 테스트가 끈 값을 남기지 않는다 — 기본(켜짐)에서 시작
    await setAdMeasurementAllowed(true);
    mockLogEvent.mockClear();
    mockSetAdvertiserIDCollectionEnabled.mockClear();
    mockSetAutoLogAppEventsEnabled.mockClear();
  });

  it('끄면 대상 이벤트도 보내지 않고 SDK 자동 이벤트·광고 ID 수집을 즉시 끈다', async () => {
    expect(await setAdMeasurementAllowed(false)).toBe(true);
    expect(mockSetAutoLogAppEventsEnabled).toHaveBeenLastCalledWith(false);
    expect(mockSetAdvertiserIDCollectionEnabled).toHaveBeenLastCalledWith(false);
    expect(getAdMeasurementAllowed()).toBe(false);

    const status = await forwardToMeta('sign_up', { method: 'kakao' });
    expect(status).toBe('opted_out');
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it('끈 동안의 첫 재생은 기록하지 않는다 — 다시 켠 뒤 첫 재생이 그대로 나간다', async () => {
    setMetaUser('user-opt-hash');
    await setAdMeasurementAllowed(false);
    const whileOff = await forwardToMeta('play_start', {
      content_id: 'c1',
      entry: 'library',
      origin: 'ai_generated',
      resumed: false,
    });
    await setAdMeasurementAllowed(true);
    const afterOn = await forwardToMeta('play_start', {
      content_id: 'c1',
      entry: 'library',
      origin: 'ai_generated',
      resumed: false,
    });
    expect(whileOff).toBe('opted_out');
    expect(afterOn).toBe('sent');
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith('first_play');
  });

  it('다시 켜면 자동 이벤트를 켜고 광고 ID 는 종전 값(iOS false)으로 돌리고 전송을 재개한다', async () => {
    await setAdMeasurementAllowed(false);
    await setAdMeasurementAllowed(true);
    expect(mockSetAutoLogAppEventsEnabled).toHaveBeenLastCalledWith(true);
    expect(mockSetAdvertiserIDCollectionEnabled).toHaveBeenLastCalledWith(false);
    const status = await forwardToMeta('onboarding_complete', {
      topic_count: 1,
      career_filled: false,
      picked_count: 0,
      elapsed_sec: 10,
    });
    expect(status).toBe('sent');
  });
});

describe('광고 측정 허용 — 앱 시작 때 저장 값으로 SDK 를 맞춘다(KAN-217)', () => {
  type SecureStorageStub = {
    get: () => Promise<string | null>;
    set: () => Promise<void>;
  };
  /**
   * 저장소를 바꿔 끼운 새 모듈 — 시작 시 읽기는 모듈마다 한 번이라 테스트마다 새로 띄운다.
   * `isolateModules` 는 이미 만들어진 목(파일 위 `jest.mock`)을 그대로 돌려줘서 `resetModules` 로 비운다
   */
  const loadIsolated = (storage: SecureStorageStub): typeof import('./meta') => {
    jest.resetModules();
    jest.doMock('@/shared/storage/secure-storage', () => ({
      secureStorage: { ...storage, remove: async () => undefined },
    }));
    return jest.requireActual<typeof import('./meta')>('./meta');
  };
  const noopSet = async (): Promise<void> => undefined;

  beforeEach(() => {
    mockLogEvent.mockClear();
    mockSetAutoLogAppEventsEnabled.mockClear();
    mockSetAdvertiserIDCollectionEnabled.mockClear();
    mockInitializeSDK.mockClear();
  });

  it('저장 값이 꺼짐이면 시작 동기화가 SDK 를 끈 채 초기화하고, 이후 이벤트는 opted_out', async () => {
    const meta = loadIsolated({ get: async () => '0', set: noopSet });
    expect(await meta.syncAdMeasurementPreference()).toBe(false);
    expect(meta.getAdMeasurementAllowed()).toBe(false);
    expect(mockSetAutoLogAppEventsEnabled).toHaveBeenCalledWith(false);
    expect(mockSetAutoLogAppEventsEnabled).not.toHaveBeenCalledWith(true);
    expect(mockSetAdvertiserIDCollectionEnabled).toHaveBeenCalledWith(false);
    expect(mockInitializeSDK).toHaveBeenCalled();
    expect(await meta.forwardToMeta('sign_up', { method: 'apple' })).toBe('opted_out');
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it('저장 값이 없으면 켜짐(기본값)이다', async () => {
    const meta = loadIsolated({ get: async () => null, set: noopSet });
    expect(await meta.syncAdMeasurementPreference()).toBe(true);
    expect(mockSetAutoLogAppEventsEnabled).toHaveBeenCalledWith(true);
    expect(await meta.forwardToMeta('sign_up', { method: 'apple' })).toBe('sent');
  });

  it('저장 값을 읽지 못하면 켜짐(기본값)으로 본다', async () => {
    const meta = loadIsolated({
      get: async () => {
        throw new Error('keychain unavailable');
      },
      set: noopSet,
    });
    expect(await meta.syncAdMeasurementPreference()).toBe(true);
    expect(meta.getAdMeasurementAllowed()).toBe(true);
    expect(await meta.forwardToMeta('sign_up', { method: 'apple' })).toBe('sent');
  });

  it('저장에 실패하면 값을 바꾸지 않고 false 를 돌려준다(화면이 원복한다)', async () => {
    const meta = loadIsolated({
      get: async () => null,
      set: async () => {
        throw new Error('write failed');
      },
    });
    expect(await meta.setAdMeasurementAllowed(false)).toBe(false);
    expect(meta.getAdMeasurementAllowed()).toBe(true);
    expect(mockSetAutoLogAppEventsEnabled).not.toHaveBeenCalledWith(false);
  });
});
