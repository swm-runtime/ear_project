import { PublicSampleView } from '../services/public-sample.service';

export class PublicSampleContentDto {
  readonly title: string;
  readonly author_name: string | null;
  readonly source_name: string;
  readonly duration_sec: number;
  readonly thumbnail_url: string;
}

export class PublicSampleAudioDto {
  readonly url: string;
  /** ISO 8601. 참고용 — 갱신 판정은 `expires_in_sec`으로 한다 */
  readonly expires_at: string;
  /** 수신 시점부터 세는 상대값. 기기 시계 오차와 무관하다(player-api.md 4.1과 같은 계약) */
  readonly expires_in_sec: number;
}

/**
 * public-api.md 2.2 — 로그인 없이 보이는 응답이므로 **표시에 필요한 값만** 싣는다.
 * 콘텐츠 id·버전·원문 링크·저장소 키 같은 운영 값은 넣지 않는다(공개 주제 목록과 같은 원칙).
 */
export class PublicSampleResponseDto {
  readonly content: PublicSampleContentDto;
  readonly audio: PublicSampleAudioDto;

  static from(view: PublicSampleView): PublicSampleResponseDto {
    return {
      content: {
        title: view.content.title,
        author_name: view.content.authorName,
        source_name: view.content.sourceName,
        duration_sec: view.content.durationSec,
        thumbnail_url: view.content.thumbnailUrl,
      },
      audio: {
        url: view.audio.url,
        expires_at: view.audio.expiresAt.toISOString(),
        expires_in_sec: view.audio.expiresInSec,
      },
    };
  }
}
