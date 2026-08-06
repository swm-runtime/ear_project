import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';

import { LibraryItemView, LibraryListResult } from '../library-screen.types';

class LibraryItemContentDto {
  readonly id: string;
  readonly title: string;
  readonly author_name: string;
  readonly source_name: string;
  readonly duration_sec: number;
  readonly thumbnail_url: string;
  /** 올라갔으면 클라이언트가 저장한 위치·오프라인 파일을 폐기한다 */
  readonly content_version: number;
  readonly topic_ids: string[];
}

class LibraryProgressDto {
  readonly position_sec: number;
  readonly max_reached_sec: number;
}

/** convention.md 3.1 — 응답 내부 항목은 `<도메인>ItemDto` */
export class LibraryItemDto {
  readonly id: string;
  /** 원값. 배지 매핑(드립·담기)은 화면이 한다 */
  readonly source: LibraryItemSource;
  readonly status: LibraryItemStatus;
  readonly added_at: string;
  readonly last_played_at: string | null;
  readonly completed_at: string | null;
  readonly is_counted_today: boolean;
  readonly content: LibraryItemContentDto;
  /** **행이 없으면 null이며 0으로 채우지 않는다** */
  readonly progress: LibraryProgressDto | null;

  static from(view: LibraryItemView): LibraryItemDto {
    return {
      id: view.id,
      source: view.source,
      status: view.status,
      added_at: view.addedAt.toISOString(),
      last_played_at: view.lastPlayedAt?.toISOString() ?? null,
      completed_at: view.completedAt?.toISOString() ?? null,
      is_counted_today: view.isCountedToday,
      content: {
        id: view.content.id,
        title: view.content.title,
        author_name: view.content.authorName,
        source_name: view.content.sourceName,
        duration_sec: view.content.durationSec,
        thumbnail_url: view.content.thumbnailUrl,
        content_version: view.content.contentVersion,
        topic_ids: view.content.topicIds,
      },
      progress: view.progress
        ? {
            position_sec: view.progress.positionSec,
            max_reached_sec: view.progress.maxReachedSec,
          }
        : null,
    };
  }
}

/**
 * library-api.md 4.1.
 *
 * **잔여 재생 표시값을 목록에 얹는다.** 전용 엔드포인트를 만들지 않는 이유는 화면 한 번
 * 그리는 데 왕복이 두 번이면 목록과 잔여 표시의 시점이 어긋나기 때문이다.
 *
 * **남은 횟수(N)를 내려주지 않는다** — `N = max(0, limit - count)`는 화면이 계산한다.
 * 같은 값을 두 이름으로 내려주면 어느 쪽이 맞는지 판단해야 하는 순간이 생긴다.
 */
export class LibraryItemListResponseDto {
  readonly items: LibraryItemDto[];
  readonly next_cursor: string | null;
  readonly has_next: boolean;
  /** **null이면 무제한** */
  readonly daily_play_limit: number | null;
  /** `daily_play_limit`이 null이면 이 값도 null이다 */
  readonly daily_play_count: number | null;
  /** 04:00 KST 경계로 계산한 날짜 라벨. UTC 타임스탬프가 아니다 */
  readonly service_date: string;

  static from(result: LibraryListResult): LibraryItemListResponseDto {
    return {
      items: result.items.map((item) => LibraryItemDto.from(item)),
      next_cursor: result.nextCursor,
      has_next: result.hasNext,
      daily_play_limit: result.quota.dailyPlayLimit,
      daily_play_count: result.quota.dailyPlayCount,
      service_date: result.quota.serviceDate,
    };
  }
}
