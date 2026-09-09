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

/**
 * auth.md 4.1 — 네이버도 대응 플래그가 없어 인증된 주소로 간주한다.
 *
 * **앱 식별이 네이버의 pairwise `id`에 얹혀 있다 — 이 파일에서 가장 중요한 가정이다.**
 *
 * 카카오는 `app_id` 대조로, 구글·애플은 `aud` 검증으로 "우리 앱을 향한 토큰인가"를 판정하는데
 * 여기에는 그런 호출이 없다. 없어도 되는 이유는 **네이버의 `id`가 애플리케이션마다 다른
 * 값이기 때문이다**(네이버 프로필 API 명세 5장 · OIDC discovery의 `subject_types_supported:
 * ["pairwise"]`). 남의 네이버 앱에서 발급된 토큰으로 이 API를 부르면 **그 앱의 네임스페이스에
 * 속한 id**가 돌아오므로, `uq_users_provider_provider_user_id`에 걸린 우리 사용자 행과는
 * 절대 일치하지 않는다. 그래서 카카오식 대조가 없어도 계정이 넘어가지 않는다.
 *
 * **이 가정이 깨지면 남의 앱 토큰이 곧 계정 탈취다.** 네이버가 id 체계를 바꾸거나, 이 클라이언트를
 * 다른 흐름(공용 id를 주는 경로)으로 옮기면 그때는 앱 식별을 별도로 세워야 한다.
 * 지금 쓸 수 있는 수단은 OIDC(`scope=openid` → `id_token.aud` 검증 — 구글·애플과 같은 모양)이며,
 * `/v1/nid/verify`는 응답에 `client_id`가 없어 **유효성 확인이지 앱 식별이 아니다.**
 * 다만 OIDC로 옮기면 `sub`가 지금 `id`와 다른 값이라 `provider_user_id` 마이그레이션이 따라온다.
 */
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
