import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables, NodeEnv } from '@/config/env.validation';
import { SocialProvider } from '@/modules/user/user.enum';

import { AppleClient } from './apple.client';
import { DevClient } from './dev.client';
import { GoogleClient } from './google.client';
import { KakaoClient } from './kakao.client';
import { NaverClient } from './naver.client';
import { SocialProviderClient } from './social-provider.client';

/** provider 값으로 클라이언트를 고른다. 분기를 Service에 두지 않기 위한 조립 지점이다 */
@Injectable()
export class SocialProviderRegistry {
  private readonly logger = new Logger(SocialProviderRegistry.name);
  private readonly clients: Map<SocialProvider, SocialProviderClient>;

  constructor(
    configService: ConfigService<EnvironmentVariables, true>,
    kakaoClient: KakaoClient,
    googleClient: GoogleClient,
    naverClient: NaverClient,
    appleClient: AppleClient,
    devClient: DevClient,
  ) {
    // 제공자 SDK 연동 전 통합 테스트를 위한 대역이다. 조립 지점에서만 갈라서
    // AuthService가 개발/운영을 구분하지 않게 한다
    if (
      configService.get('NODE_ENV', { infer: true }) === NodeEnv.DEVELOPMENT
    ) {
      this.logger.warn('social login uses the development stub client');
      this.clients = new Map(
        Object.values(SocialProvider).map(
          (provider): [SocialProvider, SocialProviderClient] => [
            provider,
            devClient,
          ],
        ),
      );

      return;
    }

    // 애플은 다른 셋과 검증 수단이 다르다 — 제공자 API를 부르지 않고 identity token을
    // 애플 공개키로 서명 검증하고 nonce를 대조한다(`apple.client.ts`).
    this.clients = new Map<SocialProvider, SocialProviderClient>([
      [kakaoClient.provider, kakaoClient],
      [googleClient.provider, googleClient],
      [naverClient.provider, naverClient],
      [appleClient.provider, appleClient],
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
