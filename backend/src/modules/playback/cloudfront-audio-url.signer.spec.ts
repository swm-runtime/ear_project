import { ConfigService } from '@nestjs/config';
import { createVerify, generateKeyPairSync } from 'node:crypto';

import { CloudFrontAudioUrlSigner } from './cloudfront-audio-url.signer';
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

  it('CDN 경로에 audio_path를 붙이고 만료·키쌍·서명 쿼리를 싣는다', () => {
    // when
    const signed = signer.sign(
      { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/abc.mp3' },
      NOW,
    );
    const url = new URL(signed.url);

    // then
    expect(url.origin + url.pathname).toBe(
      'https://cdn.example.com/audio/ep/abc.mp3',
    );
    expect(url.searchParams.get('Key-Pair-Id')).toBe('K2JCJMDEHXQW5F');
    expect(Number(url.searchParams.get('Expires'))).toBe(
      Math.floor((NOW.getTime() + AUDIO_URL_TTL_SEC * 1000) / 1000),
    );
    expect(signed.expiresInSec).toBe(AUDIO_URL_TTL_SEC);
    // userId는 URL에 실리지 않는다 — CloudFront는 우리 키만 검증한다
    expect(signed.url).not.toContain(USER_ID);
  });

  it('서명이 canned policy(URL+만료)에 대해 검증된다', () => {
    // given
    const signed = signer.sign(
      { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/abc.mp3' },
      NOW,
    );
    const url = new URL(signed.url);
    const expires = Number(url.searchParams.get('Expires'));
    const resource = url.origin + url.pathname;
    const policy = JSON.stringify({
      Statement: [
        {
          Resource: resource,
          Condition: { DateLessThan: { 'AWS:EpochTime': expires } },
        },
      ],
    });

    // when
    const verifier = createVerify('RSA-SHA1');
    verifier.update(policy);
    const ok = verifier.verify(
      publicKey,
      fromCloudFrontBase64(url.searchParams.get('Signature') ?? ''),
    );

    // then
    expect(ok).toBe(true);
  });

  it('경로 세그먼트를 인코딩하되 구분자는 유지한다', () => {
    const signed = signer.sign(
      { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'a b/c d.mp3' },
      NOW,
    );

    expect(new URL(signed.url).pathname).toBe('/audio/a%20b/c%20d.mp3');
  });
});
