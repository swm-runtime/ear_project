import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { equalsInConstantTime, hmacSha256Hex } from '@/common/utils/hash.util';
import { EnvironmentVariables } from '@/config/env.validation';

import { AUDIO_URL_TTL_SEC } from './playback.constant';
import { SignedAudioUrl } from './playback.types';

/**
 * 오디오 접근을 위한 **단기 서명 URL 발급·검증**(`architecture.md` 9.4 · `player.md` 4.8).
 *
 * 서명은 **우리 서버가 만들고 우리 서버가 검증한다.** 즉 이 URL은 스토리지를 직접 가리키지
 * 않고 우리 스트리밍 경로를 가리키며, 원본 경로(`contents.audio_path`)는 어떤 응답에도
 * 실리지 않는다(domain.md 5.1).
 *
 * **교체 지점은 이 클래스 하나다.** 오브젝트 스토리지가 확정되면 CloudFront 서명 URL이나
 * S3 presigned URL로 바꾸게 되는데, 계약은 `expires_in_sec`을 내려주는 구조라
 * (`player-api.md` 4.1) 만료값·서명 방식이 바뀌어도 클라이언트는 영향을 받지 않는다.
 *
 * 서명 키를 `JWT_SECRET`과 공유하지 않는다 — 용도가 다른 키를 겹쳐 쓰면 한쪽이 유출될 때
 * 피해 범위가 함께 넓어진다(`ARCHIVE_HASH_PEPPER`와 `WITHDRAWAL_HASH_PEPPER`를 따로 둔
 * 것과 같은 이유 — domain.md 11.2).
 */
@Injectable()
export class AudioUrlSigner {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * 만료 시각이 박힌 서명 URL을 만든다.
   *
   * **URL을 반환만 하고 어디에도 저장하지 않는다.** 발급 사실은 `audio_access_logs`가
   * 따로 남긴다(domain.md 6.5 — URL을 DB에 남기면 그것이 곧 유출 경로다).
   */
  sign(contentId: string, userId: string, now: Date): SignedAudioUrl {
    const expiresAt = new Date(now.getTime() + AUDIO_URL_TTL_SEC * 1000);
    const expiresAtSec = Math.floor(expiresAt.getTime() / 1000);
    const signature = this.buildSignature(contentId, userId, expiresAtSec);

    const baseUrl = this.configService.get('AUDIO_URL_BASE_URL', {
      infer: true,
    });
    const query = new URLSearchParams({
      user: userId,
      expires: String(expiresAtSec),
      signature,
    });

    return {
      url: `${baseUrl.replace(/\/$/, '')}/${contentId}?${query.toString()}`,
      expiresAt,
      expiresInSec: AUDIO_URL_TTL_SEC,
    };
  }

  /**
   * 스트리밍 요청의 서명을 검증한다.
   *
   * **만료를 먼저 보고 서명을 나중에 본다** — 순서가 반대여도 결과는 같지만, 만료된 요청에
   * 서명 계산을 태울 이유가 없다. 비교는 상수 시간으로 한다(타이밍 공격 방지).
   *
   * `userId`가 서명 대상에 들어 있으므로 **다른 사용자의 URL을 가져다 써도 검증을 통과하지
   * 못한다** — 서명이 사용자에 묶인다.
   */
  verify(
    contentId: string,
    userId: string,
    expiresAtSec: number,
    signature: string,
    now: Date,
  ): boolean {
    if (!Number.isInteger(expiresAtSec)) {
      return false;
    }

    if (expiresAtSec * 1000 <= now.getTime()) {
      return false;
    }

    return equalsInConstantTime(
      signature,
      this.buildSignature(contentId, userId, expiresAtSec),
    );
  }

  /**
   * `audio_access_logs.ip_hash`(domain.md 6.5).
   *
   * **원문을 남기지 않는다** — IP는 개인식별정보이고(architecture.md 9.7) 이상 탐지에는
   * 동일성만 있으면 된다. 단순 해시로는 IPv4 전 공간을 대입해 되돌릴 수 있으므로 키를 쓴다.
   *
   * 서명 키를 그대로 쓰되 `ip:` 접두사로 **용도를 분리한다.** URL 서명의 입력은
   * `<uuid>:<uuid>:<정수>` 형태라 이 접두사와 겹칠 수 없다 — 같은 키로 만든 두 값이 서로를
   * 흉내 낼 수 없다.
   */
  hashIp(ip: string | null): string | null {
    if (!ip) {
      return null;
    }

    return hmacSha256Hex(
      this.configService.get('AUDIO_URL_SIGNING_KEY', { infer: true }),
      `ip:${ip}`,
    );
  }

  /**
   * 서명 대상에 **세 값을 모두 넣는다.** 콘텐츠만 서명하면 한 사용자의 URL이 모두에게
   * 통하고, 만료를 빼면 URL이 영구 유효해진다.
   *
   * 구분자로 `:`를 쓰는 이유는 세 값 다 `:`를 포함할 수 없기 때문이다(uuid · 정수) —
   * 구분자가 값에 섞이면 서로 다른 조합이 같은 서명을 만든다.
   */
  private buildSignature(
    contentId: string,
    userId: string,
    expiresAtSec: number,
  ): string {
    return hmacSha256Hex(
      this.configService.get('AUDIO_URL_SIGNING_KEY', { infer: true }),
      `${contentId}:${userId}:${expiresAtSec}`,
    );
  }
}
