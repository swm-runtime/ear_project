import { StartPlayResult } from '../playback.types';

class PlayLibraryItemDto {
  readonly id: string;
  readonly status: string;
  readonly last_played_at: string | null;
}

class PlayProgressDto {
  readonly position_sec: number;
  readonly max_reached_sec: number;
}

/**
 * library-api.md 4.4.
 *
 * **오디오 서명 URL을 담지 않는다.** 발급은 `player-api` 소관이며, 발급 시점에 구독·한도·
 * 회수를 다시 검증한다(architecture.md 9.4). 서명 URL을 여기 실으면 재생 시작과 접근
 * 통제가 한 응답에 묶여, 통제를 강화할 때 이 계약까지 바꿔야 한다.
 */
export class StartPlayResponseDto {
  /** 이 요청으로 `play_records` 행이 새로 생겼는가. 이미 오늘 카운트된 콘텐츠면 false */
  readonly counted: boolean;
  /** 라이브러리에 없는 콘텐츠를 재생하면 null */
  readonly library_item: PlayLibraryItemDto | null;
  /** 행이 없으면 null이며 클라이언트는 0부터 재생한다 */
  readonly progress: PlayProgressDto | null;
  readonly daily_play_limit: number | null;
  /** **적재 이후의 값.** 클라이언트는 이 값으로 표시를 덮어쓴다 */
  readonly daily_play_count: number | null;
  readonly service_date: string;

  static from(result: StartPlayResult): StartPlayResponseDto {
    return {
      counted: result.counted,
      library_item: result.libraryItem
        ? {
            id: result.libraryItem.id,
            status: result.libraryItem.status,
            last_played_at:
              result.libraryItem.lastPlayedAt?.toISOString() ?? null,
          }
        : null,
      progress: result.progress
        ? {
            position_sec: result.progress.positionSec,
            max_reached_sec: result.progress.maxReachedSec,
          }
        : null,
      daily_play_limit: result.quota.dailyPlayLimit,
      daily_play_count: result.quota.dailyPlayCount,
      service_date: result.quota.serviceDate,
    };
  }
}
