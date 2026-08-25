import { ConfigService } from '@nestjs/config';
import { createVerify, generateKeyPairSync } from 'node:crypto';

import {
  buildPolicy,
  CloudFrontAudioUrlSigner,
} from './cloudfront-audio-url.signer';
import { AUDIO_URL_TTL_SEC } from './playback.constant';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const CONFIG: Record<string, string> = {
  CLOUDFRONT_KEY_PAIR_ID: 'K2JCJMDEHXQW5F',
  CLOUDFRONT_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
  AUDIO_URL_BASE_URL: 'https://cdn.example.com/audio/',
};

/** CloudFront의 base64 변형(`+`→`-`, `=`→`_`, `/`→`~`)을 되돌린다 */
function fromCloudFrontBase64(value: string): Buffer {
  return Buffer.from(
    value.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/'),
    'base64',
  );
}

describe('CloudFrontAudioUrlSigner', () => {
  let signer: CloudFrontAudioUrlSigner;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string) => CONFIG[key]),
    } as unknown as ConfigService<never, true>;

    signer = new CloudFrontAudioUrlSigner(configService);
  });

  it('URL은 /play/<contentId>이고 저장소 키·userId는 실리지 않는다', () => {
    // when
    const signed = signer.sign(
      { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/abc.mp3' },
      NOW,
    );
    const url = new URL(signed.url);

    // then — domain.md 5.1: audio_path는 어떤 응답에도 실리지 않는다
    expect(url.origin + url.pathname).toBe(
      `https://cdn.example.com/audio/play/${CONTENT_ID}`,
    );
    expect(signed.url).not.toContain('abc.mp3');
    expect(signed.url).not.toContain(USER_ID);
    expect(url.searchParams.get('Key-Pair-Id')).toBe('K2JCJMDEHXQW5F');
    expect(url.searchParams.get('Policy')).toBeTruthy();
    expect(signed.expiresInSec).toBe(AUDIO_URL_TTL_SEC);
    expect(signed.expiresAt.getTime()).toBe(
      NOW.getTime() + AUDIO_URL_TTL_SEC * 1000,
    );
  });

  it('정책은 배포 전체 와일드카드 + 만료이고, 서명이 그 정책에 대해 검증된다', () => {
    // given
    const signed = signer.sign(
      { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/abc.mp3' },
      NOW,
    );
    const url = new URL(signed.url);
    const policy = fromCloudFrontBase64(
      url.searchParams.get('Policy') ?? '',
    ).toString('utf8');

    // then — 정책 내용
    expect(policy).toBe(
      buildPolicy('https://cdn.example.com/audio', signed.expiresAt),
    );
    const parsed = JSON.parse(policy) as {
      Statement: { Resource: string }[];
    };

    expect(parsed.Statement[0].Resource).toBe(
      'https://cdn.example.com/audio/*',
    );

    // when — 서명 검증
    const verifier = createVerify('RSA-SHA1');
    verifier.update(policy);
    const ok = verifier.verify(
      publicKey,
      fromCloudFrontBase64(url.searchParams.get('Signature') ?? ''),
    );

    // then
    expect(ok).toBe(true);
  });
});
