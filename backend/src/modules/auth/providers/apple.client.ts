import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { EnvironmentVariables } from '@/config/env.validation';
import { SocialProvider } from '@/modules/user/user.enum';

import {
  APPLE_ISSUER,
  APPLE_JWKS_CACHE_TTL_MS,
  APPLE_JWKS_URL,
} from '../auth.constant';
import { ProviderAuthContext, SocialProfile } from '../auth.types';
import { JwksKeyStore } from './jwks-key-store';
import { SocialProviderClient } from './social-provider.client';

/**
 * identity token 페이로드 중 우리가 쓰는 클레임.
 *
 * **이름은 없다.** 애플은 사용자 이름을 identity token이 아니라 최초 인가 응답의 별도
 * 필드로만 내려주며, 그 값은 서명으로 검증할 수 없다(4.1 주석 참조).
 */
interface AppleIdentityTokenPayload {
  sub: string;
  email?: string;
  /** 애플은 이 두 값을 boolean이 아니라 문자열로 보내는 경우가 있다 */
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  nonce?: string;
}

/**
 * **소문자 hex다**(`auth-api.md` 4.1). 애플 네이티브 예제와 `expo-crypto`의 기본 출력이
 * hex이고 클라이언트가 그 값을 그대로 인가 요청에 싣는다 — 서버가 다른 인코딩으로 해시하면
 * 대조가 **항상** 실패한다.
 */
const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const isTrue = (value: boolean | string | undefined): boolean =>
  value === true || value === 'true';

/**
 * 애플 로그인 (`auth.md` 1·4.1 · `auth-api.md` 4.1).
 *
 * **다른 제공자와 검증 방식이 다르다.** 카카오·구글·네이버는 액세스 토큰으로 제공자
 * API를 불러 프로필을 받아오지만, 애플은 클라이언트가 보낸 **identity token(JWT) 자체를
 * 서버가 검증**한다. 그래서 `requestProvider`를 쓰지 않는다.
 */
@Injectable()
export class AppleClient extends SocialProviderClient {
  readonly provider = SocialProvider.APPLE;

  /** 공개키 캐시 — 구글과 같은 저장소(TTL · 모르는 kid 재조회 최소 간격 · 동시 조회 1회) */
  private readonly keyStore = new JwksKeyStore(
    'apple',
    APPLE_JWKS_URL,
    APPLE_JWKS_CACHE_TTL_MS,
  );

  /**
   * 서명 검증 전용 JwtService — **전역 인스턴스를 주입받지 않는다.**
   * `@nestjs/jwt`는 모듈 옵션에 `secret`이 있으면 per-call `publicKey`를 무시하고
   * 그 시크릿으로 검증한다(getSecretKey 우선순위). 전역 모듈은 `JWT_SECRET`(HS256)을
   * 갖고 있어 주입받으면 RS256 ID 토큰 검증이 항상 실패한다(실측 2026-08-31 —
   * "secretOrPublicKey must be an asymmetric key when using RS256").
   */
  private readonly jwtService = new JwtService({});

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    super();
  }

  async fetchProfile(
    providerToken: string,
    context?: ProviderAuthContext,
  ): Promise<SocialProfile> {
    const payload = await this.verifyIdentityToken(providerToken);

    this.assertNonceMatches(payload, context?.nonce);

    // 마스킹이 아니라 **전달되는** 주소다. 발송이 되므로 저장하고 인증된 것으로 본다
    // (`auth.md` 4.1 — 발송 불가인 카카오 마스킹 주소와 다르다).
    const email = payload.email ?? null;

    return {
      providerUserId: payload.sub,
      email,
      // 애플은 자기 계정의 주소만 내려주므로 클레임이 없으면 인증된 것으로 본다.
      // 릴레이 주소(is_private_email)도 도달하므로 동일하게 취급한다.
      isEmailVerified:
        email !== null && payload.email_verified !== undefined
          ? isTrue(payload.email_verified)
          : email !== null,
      // identity token에 이름이 없다. 클라이언트가 보낸 이름은 서명으로 검증할 수 없어
      // 쓰지 않는다(`architecture.md` 9.1 — 클라이언트 제공 프로필 불신).
      nickname: null,
      // 애플은 프로필 사진을 어떤 경로로도 주지 않는다
      profileImageUrl: null,
    };
  }

  private async verifyIdentityToken(
    token: string,
  ): Promise<AppleIdentityTokenPayload> {
    const kid = this.readKeyId(token);
    const key = await this.resolvePublicKey(kid);

    try {
      return await this.jwtService.verifyAsync<AppleIdentityTokenPayload>(
        token,
        {
          publicKey: key,
          algorithms: ['RS256'],
          issuer: APPLE_ISSUER,
          audience: this.allowedAudiences(),
        },
      );
    } catch (error) {
      // 만료·서명 불일치·aud 불일치를 구분해 알리지 않는다 — 공격자에게 힌트가 된다
      this.logger.warn('apple identity token verification failed', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      throw this.tokenInvalid();
    }
  }

  /**
   * `aud` 허용값 두 개 (`auth-api.md` 4.1 · README 결정 50).
   *
   * iOS 네이티브는 **앱 번들 ID**로, 안드로이드 웹 OAuth는 **Services ID**로 발급된다.
   * 애플은 제공자 API 호출 없이 토큰만으로 검증이 끝나므로 `aud`가 "우리 앱을 향한
   * 토큰인가"의 유일한 근거다 — **목록을 넓히되 그 외는 전부 거부한다.**
   */
  private allowedAudiences(): [string, ...string[]] {
    return [
      this.configService.get('APPLE_CLIENT_ID', { infer: true }),
      this.configService.get('APPLE_SERVICES_ID', { infer: true }),
    ];
  }

  /** 서명 검증 전이므로 헤더만 읽는다. 여기서 얻은 값은 키를 고르는 데만 쓴다 */
  private readKeyId(token: string): string {
    const [encodedHeader] = token.split('.');

    if (!encodedHeader) {
      throw this.tokenInvalid();
    }

    try {
      const header = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString('utf8'),
      ) as { kid?: string };

      if (!header.kid) {
        throw this.tokenInvalid();
      }

      return header.kid;
    } catch {
      throw this.tokenInvalid();
    }
  }

  private async resolvePublicKey(kid: string): Promise<string> {
    const key = await this.keyStore.resolve(kid);

    if (!key) {
      this.logger.warn('apple public key not found for kid', { kid });
      throw this.tokenInvalid();
    }

    return key;
  }

  /**
   * 재전송 공격을 막는 대조다. 클라이언트가 원본 nonce를 인가 요청과 서버 요청 양쪽에
   * 실으면, 애플은 그 해시를 토큰에 담아 돌려준다. **해시 인코딩이 클라이언트와 같아야
   * 한다**(소문자 hex — `sha256Hex` 주석).
   *
   * **토큰에 nonce가 있는데 요청에 없으면 거부한다.** 우리 클라이언트는 항상 보내야
   * 하므로, 없다는 것은 토큰이 다른 곳에서 흘러들어왔다는 뜻이다.
   */
  private assertNonceMatches(
    payload: AppleIdentityTokenPayload,
    rawNonce: string | undefined,
  ): void {
    if (!payload.nonce) {
      this.logger.warn('apple identity token has no nonce claim');
      throw this.tokenInvalid();
    }

    if (!rawNonce || sha256Hex(rawNonce) !== payload.nonce) {
      this.logger.warn('apple identity token nonce mismatch');
      throw this.tokenInvalid();
    }
  }
}
