import { Injectable } from '@nestjs/common';

import { sha256Hex } from '@/common/utils/hash.util';
import { SocialProvider } from '@/modules/user/user.enum';

import { DEV_PROVIDER_USER_ID_LENGTH } from '../auth.constant';
import { SocialProfile } from '../auth.types';
import { SocialProviderClient } from './social-provider.client';

/**
 * 개발 환경 전용 대역(代役) 클라이언트. 제공자 SDK 연동 전에 계정 생성·토큰 발급까지
 * 흐르게 하려고 둔다. 제공자 API를 호출하지 않고 **받은 토큰에서 신원을 만든다.**
 *
 * - `NODE_ENV=development`일 때만 `SocialProviderRegistry`가 이 클라이언트를 내준다.
 * - 같은 토큰은 항상 같은 계정이 된다(토큰 해시 = `provider_user_id`).
 *   새 계정이 필요하면 토큰 문자열을 바꿔서 보낸다.
 * - 이메일은 제공자가 주지 않은 경우와 똑같이 비워 둔다 — 이후 이메일 인증 플로우를
 *   그대로 탈 수 있어야 한다(auth.md 4.5).
 * - 닉네임도 비워 둔다. 온보딩에서 채우는 값이다(domain.md 3.1).
 */
@Injectable()
export class DevClient extends SocialProviderClient {
  /** 레지스트리가 세 provider 키 모두에 이 인스턴스를 등록하므로 이 값은 쓰이지 않는다 */
  readonly provider = SocialProvider.KAKAO;

  fetchProfile(providerToken: string): Promise<SocialProfile> {
    return Promise.resolve({
      providerUserId: `dev-${sha256Hex(providerToken).slice(0, DEV_PROVIDER_USER_ID_LENGTH)}`,
      email: null,
      isEmailVerified: false,
      nickname: null,
    });
  }
}
