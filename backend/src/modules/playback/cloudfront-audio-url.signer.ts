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
 * 하고, 재생기는 CDN에 직접 Range 요청을 보낸다. 에피소드 전체가 아니라 듣는 만큼만
 * 전송되는 것은 Range 요청의 기본 동작이라 여기서 따로 할 일이 없다.
 *
 * **canned policy**(단일 URL + 만료)를 쓴다. 와일드카드 정책(signed cookie)은 HLS 세그먼트
 * 처럼 URL이 여럿일 때 필요한데, 지금은 콘텐츠 하나가 파일 하나라 필요 없고, 네이티브
 * 재생기가 세그먼트 요청에 쿠키를 넘긴다는 보장도 없다.
 *
 * `userId`는 서명 대상에 들어가지 않는다 — CloudFront는 우리 키만 검증한다. 대신 만료가
 * 짧고(5분) 발급 시점의 판정이 남는다. 로컬 모드보다 URL 공유에 관대해지는 것은 사실이며,
 * 이는 CDN이 바이트를 나르는 대가다. 이상 탐지는 `audio_access_logs`가 맡는다.
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
    const objectUrl = `${this.baseUrl}/${encodeAudioPath(input.audioPath)}`;

    const url = getSignedUrl({
      url: objectUrl,
      keyPairId: this.keyPairId,
      privateKey: this.privateKey,
      dateLessThan: expiresAt.toISOString(),
    });

    return { url, expiresAt, expiresInSec: AUDIO_URL_TTL_SEC };
  }
}

/** 경로 구분자는 살리고 각 세그먼트만 인코딩한다 — `a/b c.mp3` → `a/b%20c.mp3` */
function encodeAudioPath(audioPath: string): string {
  return audioPath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join('/');
}
