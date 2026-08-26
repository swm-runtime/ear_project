import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { EnvironmentVariables } from '@/config/env.validation';
import { SocialProvider } from '@/modules/user/user.enum';

import {
  GOOGLE_ISSUERS,
  GOOGLE_JWKS_CACHE_TTL_MS,
  GOOGLE_JWKS_URL,
} from '../auth.constant';
import { SocialProfile } from '../auth.types';
import { JwksKeyStore } from './jwks-key-store';
import { SocialProviderClient } from './social-provider.client';

/** ID 토큰 페이로드 중 우리가 쓰는 클레임 */
interface GoogleIdTokenPayload {
  sub?: string;
  email?: string;
  /** 문자열로 오는 경우가 있어 boolean으로 단정하지 않는다 */
  email_verified?: boolean | string;
  name?: string;
}

const isFalse = (value: boolean | string | undefined): boolean =>
  value === false || value === 'false';

/**
 * 구글 로그인 (`auth.md` 4.1 · `auth-api.md` 4.1).
 *
 * **카카오·네이버와 검증 방식이 다르다.** 클라이언트가 보내는 것이 액세스 토큰이 아니라
 * **ID 토큰(JWT)**이라, 제공자 API를 부르지 않고 애플과 같은 경로로 검증한다 — 구글
 * 공개키로 서명을 확인하고 `iss`·`exp`와 `aud`를 대조한다.
 *
 * **`aud` 대조가 핵심이다.** 토큰만으로 검증이 끝나므로, 확인하지 않으면 다른 앱을 향해
 * 발급된 서명 정상인 토큰으로 우리 계정에 로그인할 수 있다.
 */
@Injectable()
export class GoogleClient extends SocialProviderClient {
  readonly provider = SocialProvider.GOOGLE;

  private readonly keyStore = new JwksKeyStore(
    'google',
    GOOGLE_JWKS_URL,
    GOOGLE_JWKS_CACHE_TTL_MS,
  );

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    super();
  }

  async fetchProfile(providerToken: string): Promise<SocialProfile> {
    const payload = await this.verifyIdToken(providerToken);

    if (!payload.sub) {
      throw this.tokenInvalid();
    }

    const email = payload.email ?? null;

    return {
      providerUserId: payload.sub,
      email,
      // auth.md 4.1 — 구글은 카카오의 두 플래그에 대응하는 값을 주지 않으므로 인증된 것으로
      // 간주하되, `email_verified`를 내려주면 그 값을 그대로 쓴다
      isEmailVerified: email !== null && !isFalse(payload.email_verified),
      nickname: payload.name ?? null,
    };
  }

  private async verifyIdToken(token: string): Promise<GoogleIdTokenPayload> {
    const kid = JwksKeyStore.readKeyId(token);

    if (!kid) {
      throw this.tokenInvalid();
    }

    const key = await this.keyStore.resolve(kid);

    if (!key) {
      this.logger.warn('google public key not found for kid', { kid });
      throw this.tokenInvalid();
    }

    try {
      return await this.jwtService.verifyAsync<GoogleIdTokenPayload>(token, {
        publicKey: key,
        algorithms: ['RS256'],
        issuer: GOOGLE_ISSUERS,
        audience: this.configService.get('GOOGLE_WEB_CLIENT_ID', {
          infer: true,
        }),
      });
    } catch (error) {
      // 만료·서명 불일치·aud 불일치를 구분해 알리지 않는다 — 공격자에게 힌트가 된다
      this.logger.warn('google id token verification failed', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      throw this.tokenInvalid();
    }
  }
}
