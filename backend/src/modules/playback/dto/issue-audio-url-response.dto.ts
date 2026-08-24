import { AudioUrlResult } from '../playback.types';

class AudioContentDto {
  readonly id: string;
  readonly title: string;
  /** `origin = ai_generated`는 null일 수 있다 (domain.md 5.1) */
  readonly author_name: string | null;
  readonly source_name: string;
  /** **`null`이면 [원문 보기]를 노출하지 않는다**(`origin = ai_generated`는 선택 필드다) */
  readonly source_url: string | null;
  readonly duration_sec: number;
  readonly thumbnail_url: string;
  /** 재발행 판정용. 보관한 값보다 크면 저장된 위치·오프라인 파일을 폐기한다 */
  readonly content_version: number;
}

class AudioLibraryItemDto {
  readonly id: string;
  readonly status: string;
}

class AudioProgressDto {
  readonly position_sec: number;
  readonly max_reached_sec: number;
}

class AudioDto {
  /** 단기 서명 URL. **재생기에 전달하는 용도 외로 보관·기록하지 않는다** */
  readonly url: string;
  /** 만료 시각(디버깅·로그 대조용) */
  readonly expires_at: string;
  /** **갱신 스케줄링용.** 응답 수신 시점 기준 남은 초 — 기기 시계와 무관하게 셀 수 있다 */
  readonly expires_in_sec: number;
}

/**
 * `player-api.md` 4.1 — 메타 + 서명 URL을 **한 번에** 내려준다.
 *
 * **`audio_path`(원본 경로)는 어떤 경우에도 실리지 않는다**(domain.md 5.1 · 9.4).
 * `description` · `topic_ids`도 내려주지 않는다 — 플레이어 화면이 쓰지 않는 값이다.
 */
export class IssueAudioUrlResponseDto {
  readonly content: AudioContentDto;
  /** 라이브러리에 없는 콘텐츠면 `null` */
  readonly library_item: AudioLibraryItemDto | null;
  /** 행이 없으면 `null` — 0부터 재생한다 */
  readonly progress: AudioProgressDto | null;
  readonly audio: AudioDto;

  static from(result: AudioUrlResult): IssueAudioUrlResponseDto {
    return {
      content: {
        id: result.content.id,
        title: result.content.title,
        author_name: result.content.authorName,
        source_name: result.content.sourceName,
        source_url: result.content.sourceUrl,
        duration_sec: result.content.durationSec,
        thumbnail_url: result.content.thumbnailUrl,
        content_version: result.content.contentVersion,
      },
      library_item: result.libraryItem
        ? { id: result.libraryItem.id, status: result.libraryItem.status }
        : null,
      progress: result.progress
        ? {
            position_sec: result.progress.positionSec,
            max_reached_sec: result.progress.maxReachedSec,
          }
        : null,
      audio: {
        url: result.audio.url,
        expires_at: result.audio.expiresAt.toISOString(),
        expires_in_sec: result.audio.expiresInSec,
      },
    };
  }
}
