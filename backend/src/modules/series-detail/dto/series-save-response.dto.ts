import {
  SeriesRestoreResult,
  SeriesSaveResult,
  SeriesUnsaveResult,
} from '../series-detail.types';

/** `POST /series/:series_id/save`(KAN-245) — 다시 보내도 같은 모양이다(`added_count: 0`) */
export class SaveSeriesResponseDto {
  readonly series_id: string;
  /** 이번 요청으로 새로 들어온 편 수 — 토스트 문구용. 이미 담겨 있던 편은 세지 않는다 */
  readonly added_count: number;
  readonly client_seq: number;

  static from(
    result: SeriesSaveResult,
    clientSeq: number,
  ): SaveSeriesResponseDto {
    return {
      series_id: result.seriesId,
      added_count: result.addedCount,
      client_seq: clientSeq,
    };
  }
}

/** `DELETE /series/:series_id/save`(KAN-245) */
export class UnsaveSeriesResponseDto {
  readonly series_id: string;
  /** 이번 요청으로 뺀 라이브러리 항목 id — [실행 취소] 때 `POST /series/:id/restore`에 그대로 보낸다 */
  readonly removed_item_ids: string[];
  readonly client_seq: number;

  static from(
    result: SeriesUnsaveResult,
    clientSeq: number,
  ): UnsaveSeriesResponseDto {
    return {
      series_id: result.seriesId,
      removed_item_ids: result.removedItemIds,
      client_seq: clientSeq,
    };
  }
}

/** `POST /series/:series_id/restore`(KAN-245) */
export class RestoreSeriesResponseDto {
  readonly series_id: string;
  /** 살아 있게 된 항목 — 넘긴 id 중 내 그 시리즈 편이고 노출 중인 것 */
  readonly restored_item_ids: string[];
  readonly is_saved: boolean;

  static from(result: SeriesRestoreResult): RestoreSeriesResponseDto {
    return {
      series_id: result.seriesId,
      restored_item_ids: result.restoredItemIds,
      is_saved: result.isSaved,
    };
  }
}
