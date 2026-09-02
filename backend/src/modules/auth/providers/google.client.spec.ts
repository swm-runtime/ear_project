import { generateKeyPairSync } from 'node:crypto';

import { sign } from 'jsonwebtoken';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { GOOGLE_ISSUERS, GOOGLE_JWKS_URL } from '../auth.constant';
import { GoogleClient } from './google.client';

const WEB_CLIENT_ID = '000-example.apps.googleusercontent.com';
const KID = 'google-key-1';
const SUB = '111122223333444455556';

/** 구글 공개키 역할을 할 키 쌍. 테스트가 직접 서명해 실제 검증 경로를 그대로 태운다 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwks = {
  keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256' }],
};

/** 다른 발급자가 쓰는 키 — 서명 위조 상황을 만든다 */
const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });

interface TokenOverrides {
  audience?: string;
  issuer?: string;
  email?: string | null;
  emailVerified?: boolean | string;
  name?: string | null;
  expiresIn?: string | number;
  key?: Parameters<typeof sign>[1];
  keyid?: string;
}

function buildIdToken(overrides: TokenOverrides = {}): string {
  const payload: Record<string, unknown> = { sub: SUB };

  if (overrides.email !== null) {
    payload.email = overrides.email ?? 'user@example.com';
  }
  if (overrides.emailVerified !== undefined) {
    payload.email_verified = overrides.emailVerified;
  }
  if (overrides.name !== null) {
    payload.name = overrides.name ?? '이어';
  }

  return sign(payload, overrides.key ?? privateKey, {
    algorithm: 'RS256',
    keyid: overrides.keyid ?? KID,
    issuer: overrides.issuer ?? GOOGLE_ISSUERS[0],
    audience: overrides.audience ?? WEB_CLIENT_ID,
    expiresIn: overrides.expiresIn ?? '10m',
  });
}

function buildClient(): GoogleClient {
  const configService = {
    get: (key: string) =>
      key === 'GOOGLE_WEB_CLIENT_ID' ? WEB_CLIENT_ID : undefined,
  };

  return new GoogleClient(configService as never);
}

/** 반환된 예외의 에러 코드를 확인한다 — 상황별로 힌트를 흘리지 않고 하나로 모은다 */
async function expectTokenInvalid(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await promise.catch((error: BusinessException) => {
    expect(error.errorCode).toBe(ErrorCode.AUTH_PROVIDER_TOKEN_INVALID);
  });
}

/** 목이 받은 요청 대상을 문자열로 만든다 — `Request` 객체로 올 수도 있다 */
function toUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

describe('GoogleClient', () => {
  let client: GoogleClient;
  let fetchMock: jest.SpyInstance;
  let requestedUrls: string[];

  beforeEach(() => {
    client = buildClient();
    requestedUrls = [];
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation((input) => {
      requestedUrls.push(toUrl(input));

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(jwks),
      } as Response);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('서명·발급자·수신자가 모두 맞으면 프로필을 돌려준다', async () => {
    const profile = await client.fetchProfile(buildIdToken());

    expect(profile.providerUserId).toBe(SUB);
    expect(profile.email).toBe('user@example.com');
    expect(profile.isEmailVerified).toBe(true);
    expect(profile.nickname).toBe('이어');
  });

  it('제공자 API(userinfo)를 부르지 않고 토큰만으로 검증한다', async () => {
    await client.fetchProfile(buildIdToken());

    // JWKS 조회 한 번뿐이다 — 액세스 토큰 시절의 왕복이 남아 있지 않은지 본다
    expect(requestedUrls).toEqual([GOOGLE_JWKS_URL]);
  });

  it('두 형태의 발급자를 모두 받는다 — 구글이 둘 다 발급한다', async () => {
    const profile = await client.fetchProfile(
      buildIdToken({ issuer: GOOGLE_ISSUERS[1] }),
    );

    expect(profile.providerUserId).toBe(SUB);
  });

  it('email_verified가 명시적으로 false면 인증되지 않은 것으로 본다', async () => {
    const profile = await client.fetchProfile(
      buildIdToken({ emailVerified: false }),
    );

    expect(profile.email).toBe('user@example.com');
    expect(profile.isEmailVerified).toBe(false);
  });

  it('email_verified 클레임이 없으면 인증된 것으로 간주한다', async () => {
    const profile = await client.fetchProfile(buildIdToken());

    expect(profile.isEmailVerified).toBe(true);
  });

  it('이메일을 주지 않으면 null로 두고 인증되지 않은 것으로 본다', async () => {
    const profile = await client.fetchProfile(buildIdToken({ email: null }));

    expect(profile.email).toBeNull();
    expect(profile.isEmailVerified).toBe(false);
  });

  it('다른 키로 서명된 토큰은 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(buildIdToken({ key: foreign.privateKey })),
    );
  });

  it('다른 앱을 향해 발급된 토큰(aud 불일치)은 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(
        buildIdToken({ audience: 'other.apps.googleusercontent.com' }),
      ),
    );
  });

  it('발급자가 구글이 아니면 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(buildIdToken({ issuer: 'https://evil.test' })),
    );
  });

  it('만료된 토큰은 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(buildIdToken({ expiresIn: -10 })),
    );
  });

  it('JWT 형식이 아니면 거부한다 — 액세스 토큰을 보낸 경우다', async () => {
    await expectTokenInvalid(
      client.fetchProfile('ya29.a0AfH6SMB-access-token'),
    );
  });

  it('구글이 모르는 kid로 서명된 토큰은 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(buildIdToken({ keyid: 'unknown' })),
    );
  });

  it('공개키를 캐시해 매 요청마다 구글을 부르지 않는다', async () => {
    await client.fetchProfile(buildIdToken());
    await client.fetchProfile(buildIdToken());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('구글 JWKS가 응답하지 않으면 재시도 가능한 오류로 알린다', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const promise = client.fetchProfile(buildIdToken());

    await expect(promise).rejects.toBeInstanceOf(BusinessException);
    await promise.catch((error: BusinessException) => {
      expect(error.errorCode).toBe(ErrorCode.AUTH_PROVIDER_UNAVAILABLE);
    });
  });
});
