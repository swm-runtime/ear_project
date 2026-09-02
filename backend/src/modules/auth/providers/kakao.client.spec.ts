import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { KAKAO_TOKEN_INFO_URL } from '../auth.constant';
import { KakaoClient } from './kakao.client';

const APP_ID = '1533429';
const KAKAO_ID = 4231234567;
const TOKEN = 'kakao-access-token';

interface KakaoAccount {
  email?: string;
  is_email_valid?: boolean;
  is_email_verified?: boolean;
  profile?: { nickname?: string };
}

const defaultAccount: KakaoAccount = {
  email: 'user@example.com',
  is_email_valid: true,
  is_email_verified: true,
  profile: { nickname: '이어' },
};

/** 목이 받은 요청 대상을 문자열로 만든다 — `Request` 객체로 올 수도 있다 */
function toUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function buildClient(): KakaoClient {
  const configService = {
    get: (key: string) => (key === 'KAKAO_APP_ID' ? APP_ID : undefined),
  };

  return new KakaoClient(configService as never);
}

/**
 * 카카오는 토큰 정보와 프로필을 각각 다른 경로에서 받는다. URL로 갈라 응답을 준다 —
 * 두 호출이 실제로 나가는지도 이 목이 함께 확인한다.
 */
const requestedUrls: string[] = [];

function mockKakao(options: {
  appId?: number | string | null;
  account?: KakaoAccount | null;
  profileId?: number | string | null;
}): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = toUrl(input);
    requestedUrls.push(url);

    const body =
      url === KAKAO_TOKEN_INFO_URL
        ? {
            id: KAKAO_ID,
            ...(options.appId === null
              ? {}
              : { app_id: options.appId ?? APP_ID }),
          }
        : {
            ...(options.profileId === null
              ? {}
              : { id: options.profileId ?? KAKAO_ID }),
            ...(options.account === null
              ? {}
              : { kakao_account: options.account ?? defaultAccount }),
          };

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  });
}

async function expectTokenInvalid(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await promise.catch((error: BusinessException) => {
    expect(error.errorCode).toBe(ErrorCode.AUTH_PROVIDER_TOKEN_INVALID);
  });
}

describe('KakaoClient', () => {
  let client: KakaoClient;

  beforeEach(() => {
    client = buildClient();
    requestedUrls.length = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('우리 앱을 향해 발급된 토큰이면 프로필을 돌려준다', async () => {
    mockKakao({});

    const profile = await client.fetchProfile(TOKEN);

    expect(profile.providerUserId).toBe(String(KAKAO_ID));
    expect(profile.email).toBe('user@example.com');
    expect(profile.isEmailVerified).toBe(true);
    expect(profile.nickname).toBe('이어');
  });

  it('토큰 정보 조회를 반드시 거친다 — 프로필만 받아오지 않는다', async () => {
    mockKakao({});

    await client.fetchProfile(TOKEN);

    expect(requestedUrls).toContain(KAKAO_TOKEN_INFO_URL);
  });

  it('다른 카카오 앱을 향해 발급된 토큰은 거부한다', async () => {
    mockKakao({ appId: 9999999 });

    await expectTokenInvalid(client.fetchProfile(TOKEN));
  });

  it('app_id가 없으면 거부한다 — 대상 앱을 확인할 수 없다', async () => {
    mockKakao({ appId: null });

    await expectTokenInvalid(client.fetchProfile(TOKEN));
  });

  it('app_id가 숫자로 와도 문자열로 맞춰 비교한다', async () => {
    mockKakao({ appId: Number(APP_ID) });

    const profile = await client.fetchProfile(TOKEN);

    expect(profile.providerUserId).toBe(String(KAKAO_ID));
  });

  it('마스킹 주소(is_email_valid=false)는 저장하지 않는다', async () => {
    mockKakao({
      account: { ...defaultAccount, is_email_valid: false },
    });

    const profile = await client.fetchProfile(TOKEN);

    expect(profile.email).toBeNull();
    expect(profile.isEmailVerified).toBe(false);
  });

  it('주소는 유효하지만 미인증이면 저장하되 인증되지 않은 것으로 본다', async () => {
    mockKakao({
      account: { ...defaultAccount, is_email_verified: false },
    });

    const profile = await client.fetchProfile(TOKEN);

    expect(profile.email).toBe('user@example.com');
    expect(profile.isEmailVerified).toBe(false);
  });

  it('프로필에 id가 없으면 거부한다', async () => {
    mockKakao({ profileId: null });

    await expectTokenInvalid(client.fetchProfile(TOKEN));
  });

  it('카카오가 401을 주면 거부한다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    } as Response);

    await expectTokenInvalid(client.fetchProfile(TOKEN));
  });

  it('카카오가 응답하지 않으면 재시도 가능한 오류로 알린다', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    const promise = client.fetchProfile(TOKEN);

    await expect(promise).rejects.toBeInstanceOf(BusinessException);
    await promise.catch((error: BusinessException) => {
      expect(error.errorCode).toBe(ErrorCode.AUTH_PROVIDER_UNAVAILABLE);
    });
  });
});
