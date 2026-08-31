import { SignedAudioUrl } from './playback.types';

/**
 * 서명 URL 발급기의 공통 계약. 구현은 배포 토폴로지(`AUDIO_DELIVERY`)가 고른다.
 *
 * - `local`      — `AudioUrlSigner`. 우리 서버가 서명하고 우리 스트리밍 라우트가 내보낸다.
 * - `cloudfront` — `CloudFrontAudioUrlSigner`. CloudFront가 검증하고 S3 원본을 내보낸다.
 *                  API 서버는 바이트를 나르지 않는다(architecture.md 9.4의 "교체 지점").
 *
 * 두 구현 모두 **URL을 어디에도 저장하지 않는다.** `audio_access_logs`는 발급 사실만 남긴다.
 */
export interface AudioUrlIssuer {
  sign(input: AudioUrlSignInput, now: Date): SignedAudioUrl;
}

export interface AudioUrlSignInput {
  contentId: string;
  userId: string;
  /**
   * `contents.audio_path` — 저장소 키(무작위 hex — 제목이 새지 않는다). local은 스트리밍
   * 라우트가 contentId로 다시 찾고, cloudfront는 이 키를 직접 서명한다(운영 계정 SCP가
   * KVS를 거부해 `/play` 재작성안을 폐기 — cloudfront-audio-url.signer.ts 주석).
   */
  audioPath: string;
}

export const AUDIO_URL_ISSUER = Symbol('AUDIO_URL_ISSUER');
