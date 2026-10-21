/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

import { StatsPeriodType } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { DailyPlayQuota } from '@/modules/playback/playback.types';

import { ExploreSectionKey, SaveReason } from './explore.enum';
import { UserMarket } from '@/modules/user/user.enum';
import { ContentLanguage } from '@/modules/content/content.enum';
import { ContentSeriesRef } from '@/modules/content/content.types';
import { SeriesCardView } from '@/modules/content/services/series.service';

export interface ExploreContentView {
  id: string;
  title: string;
  /** ai_generated는 null일 수 있다 — origin 분기 (domain.md 5.1) */
  authorName: string | null;
  sourceName: string;
  /** null이면 더보기 시트에 [원문 보기]를 노출하지 않는다 (개정 2026-08-24 — explore-api.md 4.1) */
  sourceUrl: string | null;
  durationSec: number;
  thumbnailUrl: string;
  language: ContentLanguage;
  /** 재발행 판정용. 올라갔으면 클라이언트가 저장한 위치·오프라인 파일을 폐기한다 */
  contentVersion: number;
  topicIds: string[];
  /** 화면 해시태그('#' 없이). 받은 적 없는 콘텐츠는 빈 배열 (KAN-162) */
  tags: string[];
  /** 속한 시리즈(KAN-134). 단일 콘텐츠는 null */
  series: ContentSeriesRef | null;
}

/**
 * 이 콘텐츠의 라이브러리 상태. **없으면 `null`** — 담기지 않은 상태다.
 *
 * 더보기 시트의 담기/제거 분기와 완청 체크 마킹이 이 값 하나로 갈린다
 * (`explore-uiux.md` 4.1). **행에 담김 표시는 두지 않는다** — 담김 여부는 시트가 말해주고,
 * 행에 나타나는 것은 `status == 'completed'`일 때의 완청 체크뿐이다.
 * 출처는 원값으로 내려주되 **탐색은 구분해 표시하지 않는다.**
 */
export interface ExploreLibraryView {
  itemId: string;
  source: LibraryItemSource;
  status: LibraryItemStatus;
}

export interface ExploreItemView {
  /**
   * 항목 종류(KAN-134 탐색 시리즈 카드). **스위치(`SERIES_EXPLORE_CARDS_ENABLED`)가 켜졌을 때만 `content`로 채운다** —
   * 꺼져 있으면 키 자체가 없어 응답이 이 기능 전과 같다
   */
  type?: 'content';
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

/**
 * 시리즈 카드(KAN-134 확정 설계 4번) — 같은 시리즈의 편들을 대신하는 항목. 스위치가 켜졌을 때만 나온다.
 * 위치는 그 시리즈 편 중 순위가 가장 높은 편의 자리다(= 편 점수의 최댓값)
 */
export interface ExploreSeriesCardView {
  type: 'series';
  card: SeriesCardView;
}

/** 탐색 목록의 항목 — 스위치가 꺼져 있으면 언제나 `ExploreItemView`(타입 키 없음)다 */
export type ExploreListItemView = ExploreItemView | ExploreSeriesCardView;

export interface ExploreSectionView {
  key: ExploreSectionKey;
  /** **화면에 그대로 그리는 문자열.** 클라이언트가 `key`로 조립하지 않는다 */
  title: string;
  /** `topic_group` 섹션만 값이 있다. 탭 시 그 주제로 단일 목록을 조회하는 데 쓴다 */
  topic: ExploreTopicView | null;
  /**
   * `popular` 섹션만 값이 있다 — 그 섹션이 어느 구간으로 만들어졌는가.
   *
   * **구간 토글의 선택 상태를 그리는 근거다**(explore-api.md 4.1). 기본값을 클라이언트에도
   * 두면 서버가 그것을 바꿀 때 토글만 옛 값에 머문다.
   */
  period: StatsPeriodType | null;
  items: ExploreListItemView[];
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

export interface ExplorePopularListQuery {
  /** 미전송이면 Controller가 기본 구간을 채운다 — 클라이언트에 기본값을 두지 않는다 */
  period: StatsPeriodType;
  cursor: string | null;
  limit: number;
}

export interface ExplorePopularListResult {
  /** **요청 구간을 그대로 되돌린다** — 토글의 선택 상태를 그리는 근거다 */
  period: StatsPeriodType;
  items: ExploreListItemView[];
  nextCursor: string | null;
  hasNext: boolean;
  quota: DailyPlayQuota;
}

/**
 * 주제 칩 한 줄(explore-api.md 4.2-2).
 *
 * `isInterest`를 함께 내려주는 이유는 **순서만으로는 어디까지가 관심 주제인지 알 수 없기**
 * 때문이다. 화면이 관심 주제 칩을 시각적으로 구분할 근거다.
 */
export interface ExploreTopicChipView {
  id: string;
  name: string;
  isInterest: boolean;
}

export interface ExploreContentListResult {
  items: ExploreListItemView[];
  /** `hasNext`가 false면 `null`이다 */
  nextCursor: string | null;
  hasNext: boolean;
  quota: DailyPlayQuota;
}

export interface ExploreSearchQuery {
  /** 클라이언트가 보낸 원문(트림만 된 상태). 정규화(NFC·소문자)는 서버가 한다 */
  query: string;
  /** 검색 결과에 주제 필터를 겹칠 때. 비우면 조건을 적용하지 않는다 */
  topicIds: string[];
  cursor: string | null;
  limit: number;
}

/**
 * 빈 결과 대체 콘텐츠(explore-api.md 4.5 — `fallback`).
 * 별도 호출로 나누면 빈 화면이 한 박자 늦게 채워지므로 같은 응답에 싣는다.
 */
export interface ExploreSearchFallback {
  relatedTopics: ExploreTopicView[];
  popularItems: ExploreListItemView[];
}

/**
 * 검색 결과의 매칭 모드(explore-api.md 4.5 `match` — KAN-238). `similar`는 부분 일치가 0건이라 자모 유사 결과로 채웠다는 뜻이다.
 * 모든 200 응답에 싣는다(`items`가 비면 `exact`)
 */
export type ExploreSearchMatch = 'exact' | 'similar';

export interface ExploreSearchResult {
  match: ExploreSearchMatch;
  items: ExploreListItemView[];
  /** `hasNext`가 false면 `null`이다 */
  nextCursor: string | null;
  hasNext: boolean;
  /** `items`가 있으면 `null`이다 */
  fallback: ExploreSearchFallback | null;
}

export interface SaveContentCommand {
  userId: string;
  contentId: string;
  market: UserMarket;
  reason: SaveReason;
  now: Date;
}

export interface SaveContentResult {
  item: LibraryItem;
  /** 새로 담겼는가 — 응답 상태가 201과 200으로 갈린다 */
  created: boolean;
  quota: DailyPlayQuota;
}

/** 섹션 조립 중간 산물 — 표시값(주제·라이브러리 상태·오늘 카운트)이 아직 붙지 않은 상태 */
export interface ExploreSectionDraft {
  key: ExploreSectionKey;
  title: string;
  topic: ExploreTopicView | null;
  period: StatsPeriodType | null;
  contents: Content[];
}
