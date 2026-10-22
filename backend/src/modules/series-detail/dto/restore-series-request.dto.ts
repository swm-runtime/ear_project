import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/**
 * 한 번에 되돌릴 수 있는 항목 수 상한 — 빼기 응답의 `removed_item_ids`를 그대로 받는다. 시리즈 편수에는 상한이 없지만
 * (domain.md 5.9) 요청 본문은 무한히 받지 않는다(architecture.md 9.3). 실제 시리즈는 수십 편 단위다.
 */
export const MAX_SERIES_RESTORE_ITEMS = 500;

/** `POST /series/:series_id/restore`(explore-api.md 4.10 — KAN-245) */
export class RestoreSeriesRequestDto {
  /** 빼기 응답의 `removed_item_ids`. 내 항목이 아니거나 그 시리즈 편이 아닌 id는 서버가 무시한다 */
  @IsArray()
  @ArrayMaxSize(MAX_SERIES_RESTORE_ITEMS)
  @IsUUID(undefined, { each: true })
  readonly item_ids: string[];
}
