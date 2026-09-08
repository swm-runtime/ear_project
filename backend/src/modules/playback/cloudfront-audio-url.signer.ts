import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { AudioUrlIssuer, AudioUrlSignInput } from './audio-url-issuer';
import { AUDIO_URL_TTL_SEC } from './playback.constant';
import { SignedAudioUrl } from './playback.types';

/**
 * CloudFront 서명 URL 발급(`architecture.md` 9.4 — 오브젝트 스토리지 확정 후의 자리).
 *
 * **바이트는 CloudFront → S3가 나른다.** API 서버는 허가 판정(`AudioUrlService`)과 서명만
 * 하고, 재생기는 CDN에 직접 Range 요청을 보낸다. 듣는 만큼만 전송되는 것은 Range 요청의
 * 기본 동작이라 여기서 따로 할 일이 없다.
 *
 * **URL은 저장소 키(`/audio/<무작위 hex>.<ext>`)를 직접 가리킨다.** 원래 설계는
 * `/play/<contentId>` + CloudFront Function(KeyValueStore 재작성)이었으나, 운영 계정(조직
 * SCP)이 KVS 데이터 플레인을 전면 거부해 폐기했다(2026-08-31 — `docs/infra/architecture.md`
 * 3.2). 키가 무작위라 제목·의미는 어차피 새지 않고, 회수 차단은 "신규 발급 중단 + 기존
 * 발급분 5분 만료 소멸"(partner-control.md 4.3)로 성립한다.
 *
 * **서명은 그 URL 하나만 허가한다** — 정책의 `Resource`가 곧 서명한 객체 URL이다.
 *
 * 종전에는 배포 전체(`<base>/*`)를 여는 custom policy였다. 이유는 "재작성 전·후 어느 URI를
 * 보든 서명 검증이 통과해야 한다"였는데, **재작성 방식 자체가 위에서 폐기돼 근거가 사라졌다.**
 * 지금은 서명 시점에 대상 URI가 하나로 정해진다.
 *
 * 와일드카드를 남겨 두면 **정당하게 발급받은 URL 하나로 배포 안의 모든 키를 5분간 받을 수 있다** —
 * 경로만 바꿔 끼우면 되고, `Resource` 값은 URL의 `Policy` 파라미터에 그대로 실려 있다.
 * 그러면 재생 한도(`paywall.md` 4.1)와 회수 차단(`partner-control.md` 4.3 — "신규 발급 중단"이
 * 유일한 차단 지점이다)이 **발급 경로에서만 성립하고 그 뒤로는 무력해진다.**
 * `architecture.md` 9.4는 이 규칙들을 "협상 대상이 아니다"로 못박는다.
 *
 * 남는 노출은 발급된 URL 자체의 5분 창뿐이며, 그것은 설계가 받아들인 지연 상한이다(9.4).
 */
@Injectable()
export class CloudFrontAudioUrlSigner implements AudioUrlIssuer {
  private readonly keyPairId: string;
  private readonly privateKey: string;
  private readonly baseUrl: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.keyPairId = configService.get('CLOUDFRONT_KEY_PAIR_ID', {
      infer: true,
    });
    // PEM은 줄바꿈을 담고 있어 env 한 줄에 싣기 어렵다. base64로 한 줄로 만들어 주입한다
    this.privateKey = Buffer.from(
      configService.get('CLOUDFRONT_PRIVATE_KEY_BASE64', { infer: true }),
      'base64',
    ).toString('utf8');
    this.baseUrl = configService
      .get('AUDIO_URL_BASE_URL', { infer: true })
      .replace(/\/$/, '');
  }

  sign(input: AudioUrlSignInput, now: Date): SignedAudioUrl {
    const expiresAt = new Date(now.getTime() + AUDIO_URL_TTL_SEC * 1000);
    const objectUrl = `${this.baseUrl}/${input.audioPath}`;

    const url = getSignedUrl({
      url: objectUrl,
      keyPairId: this.keyPairId,
      privateKey: this.privateKey,
      // **`Resource`를 이 URL 하나로 못박는다.** canned policy(`dateLessThan`)도 같은
      // 결과를 내지만 URL에 `Policy` 파라미터가 사라져, 와일드카드로 되돌아가는 회귀를
      // 테스트가 잡지 못한다 — 정책을 눈에 보이게 남긴다
      policy: buildPolicy(objectUrl, expiresAt),
    });

    return { url, expiresAt, expiresInSec: AUDIO_URL_TTL_SEC };
  }
}

/**
 * 서명이 허가하는 대상을 그 URL 하나로 못박는 policy.
 *
 * canned policy가 만드는 것과 같은 모양이며, **테스트가 서명된 URL의 `Policy` 파라미터를
 * 이 값과 대조하는 용도**다. 와일드카드로 되돌아가면 그 대조가 깨진다.
 */
export function buildPolicy(objectUrl: string, expiresAt: Date): string {
  return JSON.stringify({
    Statement: [
      {
        Resource: objectUrl,
        Condition: {
          DateLessThan: {
            'AWS:EpochTime': Math.floor(expiresAt.getTime() / 1000),
          },
        },
      },
    ],
  });
}
