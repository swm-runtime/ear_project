/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

import { LibraryItem } from './library-item.entity';
import {
  LibraryItemFilter,
  LibraryItemSort,
  LibraryItemSourceFilter,
} from './library.enum';

/**
 * 커서가 가리키는 위치. **`added_at`만으로는 부족하다** — 드립 배치는 한 사용자에게 2편을
 * 같은 트랜잭션에서 적립하므로 같은 시각의 행이 매일 생기고, 정렬 키가 유일하지 않으면
 * 페이지 경계에서 항목이 반복되거나 사라진다(domain.md 6.1).
 */
export interface LibraryCursorPosition {
  addedAt: Date;
  id: string;
}

export interface LibraryPageQuery {
  userId: string;
  /** 상태 축 */
  filter: LibraryItemFilter;
  /** 출처 축. `null`이면 출처를 가리지 않는다. **상태·주제와는 AND다** */
  sourceFilter: LibraryItemSourceFilter | null;
  /** 비어 있으면 주제 조건을 적용하지 않는다. **선택한 주제끼리는 OR다** */
  topicIds: string[];
  sort: LibraryItemSort;
  cursor: LibraryCursorPosition | null;
  limit: number;
}

export interface LibraryPage {
  items: LibraryItem[];
  /** 다음 페이지 존재 여부. `false`면 커서를 발급하지 않는다 */
  hasNext: boolean;
}

/** 주제 필터 팝업의 한 줄(library-api.md 4.2) */
export interface LibraryTopicView {
  topicId: string;
  name: string;
  itemCount: number;
}
