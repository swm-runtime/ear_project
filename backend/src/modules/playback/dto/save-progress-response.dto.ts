import { SaveProgressResult } from '../playback.types';

class ProgressLibraryItemDto {
  readonly id: string;
  readonly status: string;
  readonly completed_at: string | null;
}

/**
 * `player-api.md` 4.3.
 *
 * **완료 UI로 전환하는 근거는 이 응답 하나다** — 클라이언트는 판정하지 않는다.
 * 서버가 매 저장마다 판정하므로 90% 도달 후 늦어도 다음 저장 안에 `completed`가 실린다.
 */
export class SaveProgressResponseDto {
  /** 저장 후의 값. 버전 불일치로 저장이 버려졌으면 **서버가 보관 중인 값**이다 */
  readonly position_sec: number;
  readonly max_reached_sec: number;
  /** 서버의 현재 버전. 요청과 다르면 로컬 위치·오프라인 파일을 폐기한다 */
  readonly content_version: number;
  /** 라이브러리에 없는 콘텐츠면 `null` */
  readonly library_item: ProgressLibraryItemDto | null;

  static from(result: SaveProgressResult): SaveProgressResponseDto {
    return {
      position_sec: result.positionSec,
      max_reached_sec: result.maxReachedSec,
      content_version: result.contentVersion,
      library_item: result.libraryItem
        ? {
            id: result.libraryItem.id,
            status: result.libraryItem.status,
            completed_at: result.libraryItem.completedAt?.toISOString() ?? null,
          }
        : null,
    };
  }
}
