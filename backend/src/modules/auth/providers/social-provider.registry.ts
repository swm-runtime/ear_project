import { Injectable } from '@nestjs/common';

import { SocialProvider } from '@/modules/user/user.enum';

import { GoogleClient } from './google.client';
import { KakaoClient } from './kakao.client';
import { NaverClient } from './naver.client';
import { SocialProviderClient } from './social-provider.client';

/** provider 값으로 클라이언트를 고른다. 분기를 Service에 두지 않기 위한 조립 지점이다 */
@Injectable()
export class SocialProviderRegistry {
  private readonly clients: Map<SocialProvider, SocialProviderClient>;

  constructor(
    kakaoClient: KakaoClient,
    googleClient: GoogleClient,
    naverClient: NaverClient,
  ) {
    this.clients = new Map<SocialProvider, SocialProviderClient>([
      [kakaoClient.provider, kakaoClient],
      [googleClient.provider, googleClient],
      [naverClient.provider, naverClient],
    ]);
  }

  get(provider: SocialProvider): SocialProviderClient {
    const client = this.clients.get(provider);

    if (!client) {
      // DTO의 @IsEnum을 통과한 값만 들어오므로 여기에 닿으면 조립이 잘못된 것이다
      throw new Error(`social provider client is not registered: ${provider}`);
    }

    return client;
  }
}
