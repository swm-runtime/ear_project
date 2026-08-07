import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryItemStatus } from '@/modules/library/library.enum';

/**
 * library-api.md 4.5.
 *
 * **이미 `completed`면 그대로 200을 반환한다.** `completed_at`은 최초 값을 유지하며,
 * 90% 이후 되감아 다시 들어도 상태를 되돌리지 않는다(`library.md` 7).
 */
export class CompleteLibraryItemResponseDto {
  readonly id: string;
  readonly status: LibraryItemStatus;
  readonly completed_at: string | null;

  static from(item: LibraryItem): CompleteLibraryItemResponseDto {
    return {
      id: item.id,
      status: item.status,
      completed_at: item.completedAt?.toISOString() ?? null,
    };
  }
}
