import { ConfigService } from '@nestjs/config';

import { AudioUrlSigner } from './audio-url.signer';
import { AUDIO_URL_TTL_SEC } from './playback.constant';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

const CONFIG: Record<string, string> = {
  AUDIO_URL_SIGNING_KEY: 'test-audio-signing-key-0123456789-0123',
  AUDIO_URL_BASE_URL: 'http://localhost:3000/api/v1/audio',
};

function parse(url: string): { expires: number; signature: string } {
  const query = new URL(url).searchParams;

  return {
    expires: Number(query.get('expires')),
    signature: query.get('signature') ?? '',
  };
}

/**
 * `architecture.md` 9.4 — 오디오 접근 통제의 핵심이라 성공·실패 경로를 모두 고정한다.
 */
describe('AudioUrlSigner', () => {
  let signer: AudioUrlSigner;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string) => CONFIG[key]),
    } as unknown as ConfigService<never, true>;

    signer = new AudioUrlSigner(configService);
  });

  describe('sign', () => {
    it('만료를 설정값만큼 뒤로 두고 상대값도 함께 내려준다', () => {
      // given — 기기 시계 오차와 무관하게 갱신을 스케줄링할 수 있어야 한다

      // when
      const signed = signer.sign(
        { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/x.mp3' },
        NOW,
      );

      // then
      expect(signed.expiresInSec).toBe(AUDIO_URL_TTL_SEC);
      expect(signed.expiresAt.getTime()).toBe(
        NOW.getTime() + AUDIO_URL_TTL_SEC * 1000,
      );
    });

    it('URL에 원본 경로를 담지 않는다', () => {
      // given — audio_path는 어떤 응답에도 실리지 않는다 (domain.md 5.1)

      // when
      const signed = signer.sign(
        { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/x.mp3' },
        NOW,
      );

      // then
      expect(signed.url).toContain(CONTENT_ID);
      expect(signed.url).not.toContain('.mp3');
    });
  });

  describe('verify', () => {
    it('방금 발급한 서명은 통과한다', () => {
      // given
      const signed = signer.sign(
        { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/x.mp3' },
        NOW,
      );
      const { expires, signature } = parse(signed.url);

      // when
      const valid = signer.verify(CONTENT_ID, USER_ID, expires, signature, NOW);

      // then
      expect(valid).toBe(true);
    });

    it('만료 시각을 지나면 통과하지 못한다', () => {
      // given
      const signed = signer.sign(
        { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/x.mp3' },
        NOW,
      );
      const { expires, signature } = parse(signed.url);
      const afterExpiry = new Date(signed.expiresAt.getTime() + 1000);

      // when
      const valid = signer.verify(
        CONTENT_ID,
        USER_ID,
        expires,
        signature,
        afterExpiry,
      );

      // then
      expect(valid).toBe(false);
    });

    it('만료를 늘려 적으면 서명이 깨진다', () => {
      // given — 만료가 서명 대상에 포함되므로 값만 바꿔서는 연장할 수 없다
      const signed = signer.sign(
        { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/x.mp3' },
        NOW,
      );
      const { expires, signature } = parse(signed.url);

      // when
      const valid = signer.verify(
        CONTENT_ID,
        USER_ID,
        expires + 3600,
        signature,
        NOW,
      );

      // then
      expect(valid).toBe(false);
    });

    it('다른 사용자의 URL을 가져다 써도 통과하지 못한다', () => {
      // given — 서명이 사용자에 묶인다
      const signed = signer.sign(
        { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/x.mp3' },
        NOW,
      );
      const { expires, signature } = parse(signed.url);

      // when
      const valid = signer.verify(
        CONTENT_ID,
        OTHER_USER_ID,
        expires,
        signature,
        NOW,
      );

      // then
      expect(valid).toBe(false);
    });

    it('다른 콘텐츠로 바꿔치기해도 통과하지 못한다', () => {
      // given
      const signed = signer.sign(
        { contentId: CONTENT_ID, userId: USER_ID, audioPath: 'ep/x.mp3' },
        NOW,
      );
      const { expires, signature } = parse(signed.url);

      // when
      const valid = signer.verify(
        'bbbbbbbb-1111-4111-8111-111111111111',
        USER_ID,
        expires,
        signature,
        NOW,
      );

      // then
      expect(valid).toBe(false);
    });
  });

  describe('hashIp', () => {
    it('주소가 없으면 null을 남긴다', () => {
      // given — 프록시 뒤라 주소를 얻지 못하는 경우가 있다

      // when / then
      expect(signer.hashIp(null)).toBeNull();
    });

    it('원문을 남기지 않고 같은 주소는 같은 값으로 묶인다', () => {
      // given — 이상 탐지에는 동일성만 있으면 된다 (architecture.md 9.7)

      // when
      const hashed = signer.hashIp('203.0.113.7');

      // then
      expect(hashed).not.toContain('203.0.113.7');
      expect(hashed).toBe(signer.hashIp('203.0.113.7'));
      expect(hashed).not.toBe(signer.hashIp('203.0.113.8'));
    });
  });
});
