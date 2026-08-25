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
   * `contents.audio_path` — 저장소 키. `cloudfront` 모드에서는 CDN 경로에 그대로 실린다.
   * 키는 불투명한 식별자여야 하며(예: `<uuid>.mp3`) 사람이 읽는 제목을 담지 않는다.
   */
  audioPath: string;
}

export const AUDIO_URL_ISSUER = Symbol('AUDIO_URL_ISSUER');
