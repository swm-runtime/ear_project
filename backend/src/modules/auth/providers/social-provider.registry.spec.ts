import { SocialProvider } from '@/modules/user/user.enum';
import { NodeEnv } from '@/config/env.validation';

import { AppleClient } from './apple.client';
import { DevClient } from './dev.client';
import { GoogleClient } from './google.client';
import { KakaoClient } from './kakao.client';
import { NaverClient } from './naver.client';
import { SocialProviderRegistry } from './social-provider.registry';

/** 각 클라이언트는 자기 provider 값만 있으면 되므로 최소 형태로 세운다 */
const stub = <T>(provider: SocialProvider): T => ({ provider }) as T;

function buildRegistry(nodeEnv: NodeEnv): SocialProviderRegistry {
  const configService = { get: () => nodeEnv };

  return new SocialProviderRegistry(
    configService as never,
    stub<KakaoClient>(SocialProvider.KAKAO),
    stub<GoogleClient>(SocialProvider.GOOGLE),
    stub<NaverClient>(SocialProvider.NAVER),
    stub<AppleClient>(SocialProvider.APPLE),
    stub<DevClient>(SocialProvider.KAKAO),
  );
}

describe('SocialProviderRegistry', () => {
  describe('운영 환경', () => {
    it('enum에 있는 provider 전부에 클라이언트가 등록돼 있다', () => {
      const registry = buildRegistry(NodeEnv.PRODUCTION);

      // enum에 값을 추가하고 클라이언트를 빠뜨리면 여기서 걸린다.
      // DTO의 @IsEnum은 통과시키므로, 등록 누락은 운영에서만 터진다
      for (const provider of Object.values(SocialProvider)) {
        expect(() => registry.get(provider)).not.toThrow();
      }
    });

    it('provider 값에 맞는 클라이언트를 돌려준다', () => {
      const registry = buildRegistry(NodeEnv.PRODUCTION);

      for (const provider of Object.values(SocialProvider)) {
        expect(registry.get(provider).provider).toBe(provider);
      }
    });

    it('애플도 전용 클라이언트로 연결된다 — 개발 대역이 아니다', () => {
      const registry = buildRegistry(NodeEnv.PRODUCTION);

      expect(registry.get(SocialProvider.APPLE).provider).toBe(
        SocialProvider.APPLE,
      );
    });
  });

  describe('개발 환경', () => {
    it('모든 provider가 개발 대역 하나로 묶인다', () => {
      const registry = buildRegistry(NodeEnv.DEVELOPMENT);
      const clients = Object.values(SocialProvider).map((provider) =>
        registry.get(provider),
      );

      expect(new Set(clients).size).toBe(1);
    });
  });
});
