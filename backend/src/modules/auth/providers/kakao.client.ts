import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { SocialProvider } from '@/modules/user/user.enum';

import { KAKAO_TOKEN_INFO_URL } from '../auth.constant';
import { SocialProfile } from '../auth.types';
import { SocialProviderClient } from './social-provider.client';

const KAKAO_PROFILE_URL = 'https://kapi.kakao.com/v2/user/me';

interface KakaoProfileResponse {
  id?: number | string;
  kakao_account?: {
    email?: string;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    profile?: { nickname?: string };
  };
}

/** 토큰 정보 조회 응답. `app_id`는 이 토큰이 어느 카카오 앱을 향해 발급됐는지를 말한다 */
interface KakaoTokenInfoResponse {
  id?: number | string;
  app_id?: number | string;
}

/**
 * auth.md 4.1 — 카카오는 **두 플래그를 모두** 확인한다.
 *
 * | is_email_valid | is_email_verified | email | is_email_verified |
 * |---|---|---|---|
 * | true | true  | 받은 주소 | true  |
 * | true | false | 받은 주소 | false |
 * | false | —    | **null** (마스킹 주소) | false |
 *
 * 마스킹 여부를 문자열 패턴(`***`)으로 판정하지 않는다 — 형식이 바뀌면 그대로 뚫린다.
 */
@Injectable()
export class KakaoClient extends SocialProviderClient {
  readonly provider = SocialProvider.KAKAO;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    super();
  }

  async fetchProfile(providerToken: string): Promise<SocialProfile> {
    // 두 호출은 서로 독립이라 함께 보낸다 — 로그인 지연이 카카오 왕복 두 번에 묶이지 않게 한다.
    // 남의 앱 토큰이면 프로필을 받아오더라도 아래에서 버린다(저장 경로에 닿지 않는다).
    const [tokenInfo, payload] = (await Promise.all([
      this.requestProvider(KAKAO_TOKEN_INFO_URL, providerToken),
      this.requestProvider(KAKAO_PROFILE_URL, providerToken),
    ])) as [KakaoTokenInfoResponse, KakaoProfileResponse];

    this.assertIssuedForOurApp(tokenInfo);

    if (payload.id === undefined || payload.id === null) {
      throw this.tokenInvalid();
    }

    const account = payload.kakao_account;
    const isEmailValid = account?.is_email_valid === true;
    const isEmailVerified = account?.is_email_verified === true;
    const email = isEmailValid ? (account?.email ?? null) : null;

    return {
      providerUserId: String(payload.id),
      email,
      isEmailVerified: email !== null && isEmailVerified,
      nickname: account?.profile?.nickname ?? null,
    };
  }

  /**
   * `auth-api.md` 4.1 — **액세스 토큰에는 대상 앱 정보가 실려 있지 않다.**
   *
   * 프로필만 받아오면 다른 카카오 앱에서 발급된 정상 토큰으로도 우리 계정에 로그인할 수
   * 있다. `app_id` 대조가 구글·애플의 `aud` 검증에 해당하는 자리다.
   */
  private assertIssuedForOurApp(tokenInfo: KakaoTokenInfoResponse): void {
    const appId = tokenInfo.app_id;
    const expected = this.configService.get('KAKAO_APP_ID', { infer: true });

    if (appId === undefined || appId === null || String(appId) !== expected) {
      // 숫자로도 문자열로도 오므로 문자열로 맞춰 비교한다
      this.logger.warn('kakao access token was issued for another app', {
        appId: appId ?? null,
      });
      throw this.tokenInvalid();
    }
  }
}
