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
 * 정책은 **custom policy + 배포 전체 와일드카드**다. 서명 검증이 재작성 전·후 어느 URI를
 * 보든 통과해야 하기 때문이다. 대가로, 유효한 URL 하나를 5분 안에 다른 contentId로 고쳐
 * 쓰는 것을 CloudFront가 막지 않는다 — 그 5분 창은 발급 시점 판정(구독·한도·회수)이
 * 이미 통과된 사용자에게만 열리고, 이상 탐지는 `audio_access_logs`가 맡는다.
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
      policy: buildPolicy(this.baseUrl, expiresAt),
    });

    return { url, expiresAt, expiresInSec: AUDIO_URL_TTL_SEC };
  }
}

/** 배포 전체(`<base>/*`)에 대해 만료만 거는 custom policy. 이유는 클래스 주석 참조 */
export function buildPolicy(baseUrl: string, expiresAt: Date): string {
  return JSON.stringify({
    Statement: [
      {
        Resource: `${baseUrl}/*`,
        Condition: {
          DateLessThan: {
            'AWS:EpochTime': Math.floor(expiresAt.getTime() / 1000),
          },
        },
      },
    ],
  });
}
