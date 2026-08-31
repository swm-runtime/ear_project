import { generateKeyPairSync } from 'node:crypto';

import { sign } from 'jsonwebtoken';

import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { BusinessException } from '@/common/exceptions/business.exception';

import { APPLE_ISSUER } from '../auth.constant';
import { AppleClient } from './apple.client';

const CLIENT_ID = 'com.example.ear';
const SERVICES_ID = 'com.example.ear.signin';
const KID = 'apple-key-1';
const SUB = '001234.abcdef.0000';
const RAW_NONCE = 'nonce-from-client';
/**
 * **서버 코드로 만들지 않고 값을 박는다.** 서버 자신의 해시 함수로 픽스처를 만들면
 * 인코딩이 틀려도 자기 자신과는 일치해 통과한다 — 실제로 그렇게 base64url 오구현이
 * 테스트를 통과한 채 남아 있었다(`tickets/backend/archive/apple-nonce-hash-encoding-mismatch.md`).
 * 아래는 `printf 'nonce-from-client' | sha256sum`의 값이다.
 */
const HASHED_NONCE =
  'ccedcc2f3121f6d6a2316dc610fa92978d95e68e38f5d090f23132cb8bf89b9d';

/** 애플 공개키 역할을 할 키 쌍. 테스트가 직접 서명해 실제 검증 경로를 그대로 태운다 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
/** 애플이 내려주는 것과 같은 형태의 JWKS */
const jwks = {
  keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256' }],
};

/** 다른 발급자가 쓰는 키 — 서명 위조 상황을 만든다 */
const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });

interface TokenOverrides {
  audience?: string;
  issuer?: string;
  nonce?: string | null;
  email?: string | null;
  emailVerified?: boolean | string;
  expiresIn?: string | number;
  key?: Parameters<typeof sign>[1];
}

function buildIdentityToken(overrides: TokenOverrides = {}): string {
  const payload: Record<string, unknown> = { sub: SUB };

  if (overrides.nonce !== null) {
    payload.nonce = overrides.nonce ?? HASHED_NONCE;
  }
  if (overrides.email !== null) {
    payload.email = overrides.email ?? 'user@example.com';
  }
  if (overrides.emailVerified !== undefined) {
    payload.email_verified = overrides.emailVerified;
  }

  return sign(payload, overrides.key ?? privateKey, {
    algorithm: 'RS256',
    keyid: KID,
    issuer: overrides.issuer ?? APPLE_ISSUER,
    audience: overrides.audience ?? CLIENT_ID,
    expiresIn: overrides.expiresIn ?? '10m',
  });
}

function buildClient(): AppleClient {
  const configService = {
    get: (key: string) => {
      if (key === 'APPLE_CLIENT_ID') return CLIENT_ID;
      if (key === 'APPLE_SERVICES_ID') return SERVICES_ID;

      return undefined;
    },
  };

  return new AppleClient(configService as never);
}

/** 반환된 예외의 에러 코드를 확인한다 — 상황별로 힌트를 흘리지 않고 하나로 모은다 */
async function expectTokenInvalid(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await promise.catch((error: BusinessException) => {
    expect(error.errorCode).toBe(ErrorCode.AUTH_PROVIDER_TOKEN_INVALID);
  });
}

describe('AppleClient', () => {
  let client: AppleClient;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    client = buildClient();
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(jwks),
    } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('서명·발급자·수신자·nonce가 모두 맞으면 프로필을 돌려준다', async () => {
    const profile = await client.fetchProfile(buildIdentityToken(), {
      nonce: RAW_NONCE,
    });

    expect(profile.providerUserId).toBe(SUB);
    expect(profile.email).toBe('user@example.com');
    expect(profile.isEmailVerified).toBe(true);
  });

  it('이름은 identity token에 없으므로 닉네임은 항상 null이다', async () => {
    const profile = await client.fetchProfile(buildIdentityToken(), {
      nonce: RAW_NONCE,
    });

    expect(profile.nickname).toBeNull();
  });

  it('릴레이 주소도 발송이 되므로 저장하고 인증된 것으로 본다', async () => {
    const profile = await client.fetchProfile(
      buildIdentityToken({
        email: 'abc123@privaterelay.appleid.com',
        emailVerified: 'true',
      }),
      { nonce: RAW_NONCE },
    );

    expect(profile.email).toBe('abc123@privaterelay.appleid.com');
    expect(profile.isEmailVerified).toBe(true);
  });

  it('이메일을 주지 않으면 null로 두고 인증되지 않은 것으로 본다', async () => {
    const profile = await client.fetchProfile(
      buildIdentityToken({ email: null }),
      { nonce: RAW_NONCE },
    );

    expect(profile.email).toBeNull();
    expect(profile.isEmailVerified).toBe(false);
  });

  it('다른 키로 서명된 토큰은 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(buildIdentityToken({ key: foreign.privateKey }), {
        nonce: RAW_NONCE,
      }),
    );
  });

  it('안드로이드 웹 플로우의 Services ID도 유효한 aud로 받는다', async () => {
    const profile = await client.fetchProfile(
      buildIdentityToken({ audience: SERVICES_ID }),
      { nonce: RAW_NONCE },
    );

    expect(profile.providerUserId).toBe(SUB);
  });

  it('iOS 네이티브의 번들 ID는 종전대로 받는다', async () => {
    const profile = await client.fetchProfile(
      buildIdentityToken({ audience: CLIENT_ID }),
      { nonce: RAW_NONCE },
    );

    expect(profile.providerUserId).toBe(SUB);
  });

  it('다른 앱을 향해 발급된 토큰(aud 불일치)은 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(buildIdentityToken({ audience: 'com.other.app' }), {
        nonce: RAW_NONCE,
      }),
    );
  });

  it('발급자가 애플이 아니면 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(buildIdentityToken({ issuer: 'https://evil.test' }), {
        nonce: RAW_NONCE,
      }),
    );
  });

  it('만료된 토큰은 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(buildIdentityToken({ expiresIn: -10 }), {
        nonce: RAW_NONCE,
      }),
    );
  });

  it('nonce 해시는 소문자 hex다 — 클라이언트와 같은 인코딩이어야 대조가 성립한다', async () => {
    // 알려진 값의 SHA-256 hex를 nonce 클레임에 심어, 서버가 같은 인코딩으로 해시하는지 본다
    const profile = await client.fetchProfile(
      buildIdentityToken({
        nonce:
          'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      }),
      { nonce: 'abc' },
    );

    expect(profile.providerUserId).toBe(SUB);
  });

  it('nonce가 일치하지 않으면 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(buildIdentityToken(), { nonce: 'another-nonce' }),
    );
  });

  it('요청에 nonce가 없으면 거부한다 — 우리 클라이언트는 항상 보낸다', async () => {
    await expectTokenInvalid(client.fetchProfile(buildIdentityToken(), {}));
  });

  it('토큰에 nonce 클레임이 없으면 거부한다', async () => {
    await expectTokenInvalid(
      client.fetchProfile(buildIdentityToken({ nonce: null }), {
        nonce: RAW_NONCE,
      }),
    );
  });

  it('공개키를 캐시해 매 요청마다 애플을 부르지 않는다', async () => {
    await client.fetchProfile(buildIdentityToken(), { nonce: RAW_NONCE });
    await client.fetchProfile(buildIdentityToken(), { nonce: RAW_NONCE });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('캐시에 없는 kid가 오면 키 교체로 보고 한 번 더 받아온다', async () => {
    await client.fetchProfile(buildIdentityToken(), { nonce: RAW_NONCE });

    const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          keys: [
            {
              ...rotated.publicKey.export({ format: 'jwk' }),
              kid: 'apple-key-2',
              alg: 'RS256',
            },
          ],
        }),
    });

    const token = sign({ sub: SUB, nonce: HASHED_NONCE }, rotated.privateKey, {
      algorithm: 'RS256',
      keyid: 'apple-key-2',
      issuer: APPLE_ISSUER,
      audience: CLIENT_ID,
      expiresIn: '10m',
    });

    await expect(
      client.fetchProfile(token, { nonce: RAW_NONCE }),
    ).resolves.toMatchObject({ providerUserId: SUB });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('애플 키 서버가 응답하지 않으면 재시도 가능한 오류로 바꾼다', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      client.fetchProfile(buildIdentityToken(), { nonce: RAW_NONCE }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.AUTH_PROVIDER_UNAVAILABLE,
    });
  });
});
