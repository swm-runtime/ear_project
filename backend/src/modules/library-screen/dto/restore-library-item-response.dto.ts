import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryItemStatus } from '@/modules/library/library.enum';

/**
 * library-api.md 4.7.
 *
 * **`added_at`과 `status`를 유지한다.** 복구를 새 적립으로 처리하면 항목이 목록 맨 위로
 * 올라와 순서가 바뀐다 — 사용자가 되돌린 것은 삭제이지 적립 시각이 아니다.
 *
 * **삭제되지 않은 항목에 호출해도 200과 현재 상태를 반환한다.** 큐 재전송으로 같은 복구가
 * 두 번 도착할 수 있다.
 */
export class RestoreLibraryItemResponseDto {
  readonly id: string;
  readonly status: LibraryItemStatus;
  readonly added_at: string;
  readonly deleted_at: string | null;

  static from(item: LibraryItem): RestoreLibraryItemResponseDto {
    return {
      id: item.id,
      status: item.status,
      added_at: item.addedAt.toISOString(),
      deleted_at: item.deletedAt?.toISOString() ?? null,
    };
  }
}
