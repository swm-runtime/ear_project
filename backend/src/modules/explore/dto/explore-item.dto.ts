import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';

import { ExploreItemView } from '../explore.types';

class ExploreContentDto {
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

/**
 * 이 콘텐츠의 라이브러리 상태. **담기지 않았으면 응답에서 `null`이다.**
 * 더보기 시트의 담기/제거 분기와 완청 체크 마킹이 이 값 하나로 갈린다.
 * **행에 담김 표시는 두지 않는다** — 행에 나타나는 것은 `status == 'completed'`일 때의 체크뿐이다.
 */
class ExploreLibraryDto {
  readonly item_id: string;
  readonly source: LibraryItemSource;
  readonly status: LibraryItemStatus;
}

/**
 * convention.md 3.1 — 응답 내부 항목은 `<도메인>ItemDto`.
 *
 * **피드(4.1)·필터 목록(4.2)이 같은 모양을 쓴다.** 두 모드가 다른 행 타입을 쓰면 담기·재생
 * 처리가 두 벌이 된다(explore-api.md 4.2).
 */
export class ExploreItemDto {
  readonly content: ExploreContentDto;
  readonly library: ExploreLibraryDto | null;
  /** 재생 확인 팝업을 탭 즉시 띄우기 위한 힌트. **판정이 아니다** */
  readonly is_counted_today: boolean;

  static from(view: ExploreItemView): ExploreItemDto {
    return {
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
      library: view.library
        ? {
            item_id: view.library.itemId,
            source: view.library.source,
            status: view.library.status,
          }
        : null,
      is_counted_today: view.isCountedToday,
    };
  }
}
