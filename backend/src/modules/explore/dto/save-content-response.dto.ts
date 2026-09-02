import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';

import { SaveContentResult } from '../explore.types';

class SavedLibraryItemDto {
  readonly id: string;
  readonly source: LibraryItemSource;
  readonly status: LibraryItemStatus;
  readonly added_at: string;
}

/**
 * explore-api.md 4.3 — **201은 새로 담김, 200은 이미 담겨 있음**이다.
 *
 * 본문은 두 경우가 같다. 클라이언트 동작이 같기 때문이며(토스트 + 시트 상태 갱신), 상태 코드는
 * 재시도·큐 재전송이 새 담기를 만들었는지 구분하려는 운영·분석용이다.
 *
 * `client_seq`를 그대로 되돌린다 — 클라이언트는 자신이 마지막으로 보낸 순번보다 작은 값이
 * 담긴 응답을 무시해 담기→해제 연타의 순서 뒤바뀜을 방어한다.
 */
export class SaveContentResponseDto {
  readonly library_item: SavedLibraryItemDto;
  readonly client_seq: number;
  readonly daily_play_limit: number | null;
  readonly daily_play_count: number | null;
  readonly service_date: string;

  static from(
    result: SaveContentResult,
    clientSeq: number,
  ): SaveContentResponseDto {
    return {
      library_item: {
        id: result.item.id,
        source: result.item.source,
        status: result.item.status,
        added_at: result.item.addedAt.toISOString(),
      },
      client_seq: clientSeq,
      daily_play_limit: result.quota.dailyPlayLimit,
      daily_play_count: result.quota.dailyPlayCount,
      service_date: result.quota.serviceDate,
    };
  }
}
