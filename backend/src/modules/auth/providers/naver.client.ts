import { Injectable } from '@nestjs/common';

import { SocialProvider } from '@/modules/user/user.enum';

import { SocialProfile } from '../auth.types';
import { SocialProviderClient } from './social-provider.client';

const NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me';

interface NaverProfileResponse {
  resultcode?: string;
  response?: {
    id?: string;
    email?: string;
    nickname?: string;
  };
}

/** auth.md 4.1 — 네이버도 대응 플래그가 없어 인증된 주소로 간주한다 */
@Injectable()
export class NaverClient extends SocialProviderClient {
  readonly provider = SocialProvider.NAVER;

  async fetchProfile(providerToken: string): Promise<SocialProfile> {
    const payload = (await this.requestProvider(
      NAVER_PROFILE_URL,
      providerToken,
    )) as NaverProfileResponse;

    const profile = payload.response;
    if (payload.resultcode !== '00' || !profile?.id) {
      throw this.tokenInvalid();
    }

    const email = profile.email ?? null;

    return {
      providerUserId: profile.id,
      email,
      isEmailVerified: email !== null,
      nickname: profile.nickname ?? null,
    };
  }
}
