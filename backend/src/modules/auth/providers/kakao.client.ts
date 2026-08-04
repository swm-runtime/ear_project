import { Injectable } from '@nestjs/common';

import { SocialProvider } from '@/modules/user/user.enum';

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

  async fetchProfile(providerToken: string): Promise<SocialProfile> {
    const payload = (await this.requestProvider(
      KAKAO_PROFILE_URL,
      providerToken,
    )) as KakaoProfileResponse;

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
}
