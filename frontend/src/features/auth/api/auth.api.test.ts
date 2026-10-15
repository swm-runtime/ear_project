import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { getCurrentUser, signUp, socialLogin } from './auth.api';
import type { AuthSessionDto, UserDto } from './auth.api';

// 실서버 경로의 계약을 본다 — 테스트 환경은 __DEV__ 라 mock 플래그를 끈다
jest.mock('../auth.constants', () => ({
  ...jest.requireActual<object>('../auth.constants'),
  IS_AUTH_API_MOCKED: false,
}));

const mockGet = jest.fn<(url: string, config?: unknown) => Promise<{ data: unknown }>>();
const mockPost =
  jest.fn<(url: string, body: unknown, config?: unknown) => Promise<{ data: unknown }>>();
jest.mock('@/shared/api/api-client', () => ({
  apiClient: {
    get: (url: string, config?: unknown) => mockGet(url, config),
    post: (url: string, body: unknown, config?: unknown) => mockPost(url, body, config),
  },
}));

const LEGACY_USER: UserDto = {
  id: 'u1',
  nickname: null,
  email: null,
  is_email_verified: false,
  provider: 'google',
  tier: 'free',
  role: 'user',
  onboarding_completed: false,
  onboarding_step: 'topic',
};

const sessionWith = (user: UserDto): AuthSessionDto => ({
  status: 'authenticated',
  access_token: 'a',
  refresh_token: 'r',
  access_token_expires_at: '2026-10-15T00:00:00.000Z',
  pending_consents: [],
  user,
});

const DEVICE = { languageCode: 'en-US', regionCode: 'US', timezone: 'America/New_York' };

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('auth.api — locale(global-api.md 4.1)', () => {
  it('가입은 고른 콘텐츠 언어를 locale.preferred_language 로 보낸다', async () => {
    mockPost.mockResolvedValue({ data: sessionWith(LEGACY_USER) });

    await signUp({
      signupToken: 't',
      deviceId: 'd',
      consents: [],
      locale: { ...DEVICE, preferredLanguage: 'ko' },
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/auth/sign-up',
      expect.objectContaining({
        locale: {
          preferred_language: 'ko',
          language_code: 'en-US',
          region_code: 'US',
          timezone: 'America/New_York',
        },
      }),
      expect.anything(),
    );
  });

  it('로그인은 기기 값만 보낸다 — preferred_language 는 가입 전용이다', async () => {
    mockPost.mockResolvedValue({ data: sessionWith(LEGACY_USER) });

    await socialLogin({
      provider: 'google',
      providerToken: 'p',
      deviceId: 'd',
      locale: { ...DEVICE, preferredLanguage: 'en' },
    });

    const body = mockPost.mock.calls[0]?.[1] as { locale: Record<string, unknown> };
    expect(body.locale).toEqual({
      language_code: 'en-US',
      region_code: 'US',
      timezone: 'America/New_York',
    });
  });

  it('지역이 없는 기기 로캘은 region_code 키를 싣지 않는다', async () => {
    mockPost.mockResolvedValue({ data: sessionWith(LEGACY_USER) });

    await socialLogin({
      provider: 'google',
      providerToken: 'p',
      deviceId: 'd',
      locale: { languageCode: 'ko', timezone: 'Asia/Seoul' },
    });

    const body = mockPost.mock.calls[0]?.[1] as { locale: Record<string, unknown> };
    expect(body.locale).not.toHaveProperty('region_code');
  });
});

describe('auth.api — user.market', () => {
  it('응답의 market·language_code·timezone 을 그대로 옮긴다', async () => {
    mockGet.mockResolvedValue({
      data: {
        user: {
          ...LEGACY_USER,
          market: 'global',
          language_code: 'en-US',
          timezone: 'America/New_York',
        },
        pending_consents: [],
      },
    });

    const { user } = await getCurrentUser();

    expect(user).toMatchObject({
      market: 'global',
      languageCode: 'en-US',
      timezone: 'America/New_York',
    });
  });

  it('market 이 없는 응답(구 서버)은 kr 로 받는다', async () => {
    mockPost.mockResolvedValue({ data: sessionWith(LEGACY_USER) });

    const session = await signUp({
      signupToken: 't',
      deviceId: 'd',
      consents: [],
      locale: { ...DEVICE, preferredLanguage: 'en' },
    });

    expect(session.user).toMatchObject({ market: 'kr', languageCode: null, timezone: null });
  });
});
