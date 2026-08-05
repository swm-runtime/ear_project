import { Injectable } from '@nestjs/common';

import { SocialProvider } from '@/modules/user/user.enum';

import { SocialProfile } from '../auth.types';
import { SocialProviderClient } from './social-provider.client';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

interface GoogleUserInfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/**
 * auth.md 4.1 — 구글은 카카오의 두 플래그에 대응하는 값을 주지 않으므로 인증된 것으로 간주하되,
 * `email_verified` 클레임을 내려주면 그 값을 그대로 쓴다.
 */
@Injectable()
export class GoogleClient extends SocialProviderClient {
  readonly provider = SocialProvider.GOOGLE;

  async fetchProfile(providerToken: string): Promise<SocialProfile> {
    const payload = (await this.requestProvider(
      GOOGLE_USERINFO_URL,
      providerToken,
    )) as GoogleUserInfoResponse;

    if (!payload.sub) {
      throw this.tokenInvalid();
    }

    const email = payload.email ?? null;

    return {
      providerUserId: payload.sub,
      email,
      isEmailVerified: email !== null && payload.email_verified !== false,
      nickname: payload.name ?? null,
    };
  }
}
