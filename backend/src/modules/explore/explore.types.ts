/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

import { Content } from '@/modules/content/entities/content.entity';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { DailyPlayQuota } from '@/modules/playback/playback.types';

import { ExploreSectionKey, SaveReason } from './explore.enum';

export interface ExploreContentView {
  id: string;
  title: string;
  authorName: string;
  sourceName: string;
  durationSec: number;
  thumbnailUrl: string;
  /** 재발행 판정용. 올라갔으면 클라이언트가 저장한 위치·오프라인 파일을 폐기한다 */
  contentVersion: number;
  topicIds: string[];
}

/**
 * 이 콘텐츠의 라이브러리 상태. **없으면 `null`** — 담기지 않은 상태다.
 *
 * 행의 "담김" 표시와 더보기 시트의 담기/제거 분기가 이 값 하나로 갈린다
 * (`explore-uiux.md` 4.1). 출처는 원값으로 내려주되 **탐색은 배지로 구분하지 않는다** —
 * 여기서 필요한 정보는 "이미 내 라이브러리에 있다" 하나뿐이다.
 */
export interface ExploreLibraryView {
  itemId: string;
  source: LibraryItemSource;
  status: LibraryItemStatus;
}

export interface ExploreItemView {
  content: ExploreContentView;
  library: ExploreLibraryView | null;
  /**
   * 오늘의 서비스 날짜에 이 콘텐츠의 `play_records` 행이 있는가.
   *
   * **컬럼이 아니라 조회 결과이며 힌트이지 판정이 아니다**(라이브러리와 같은 필드·같은 이유).
   * 재생 확인 팝업을 **탭한 직후 즉시** 띄우기 위해 목록에 함께 싣는다.
   */
  isCountedToday: boolean;
}

export interface ExploreSectionView {
  key: ExploreSectionKey;
  /** **화면에 그대로 그리는 문자열.** 클라이언트가 `key`로 조립하지 않는다 */
  title: string;
  /** `topic_group` 섹션만 값이 있다. 탭 시 그 주제로 단일 목록을 조회하는 데 쓴다 */
  topic: ExploreTopicView | null;
  items: ExploreItemView[];
}

export interface ExploreTopicView {
  id: string;
  name: string;
}

export interface ExploreFeedResult {
  /** 섹션이 하나도 없으면 빈 배열이다. **404가 아니다** — 빈 피드 화면을 그린다 */
  sections: ExploreSectionView[];
  quota: DailyPlayQuota;
}

export interface ExploreContentListQuery {
  /** 비울 수 없다. 필터가 없는 상태는 피드가 담당한다 */
  topicIds: string[];
  cursor: string | null;
  limit: number;
}

export interface ExploreContentListResult {
  items: ExploreItemView[];
  /** `hasNext`가 false면 `null`이다 */
  nextCursor: string | null;
  hasNext: boolean;
  quota: DailyPlayQuota;
}

export interface SaveContentCommand {
  userId: string;
  contentId: string;
  reason: SaveReason;
  now: Date;
}

export interface SaveContentResult {
  item: LibraryItem;
  /** 새로 담겼는가 — 응답 상태가 201과 200으로 갈린다 */
  created: boolean;
  quota: DailyPlayQuota;
}

/** 섹션 조립 중간 산물 — 표시값(담김·오늘 카운트)이 아직 붙지 않은 상태 */
export interface ExploreSectionDraft {
  key: ExploreSectionKey;
  title: string;
  topic: ExploreTopicView | null;
  contents: Content[];
}
