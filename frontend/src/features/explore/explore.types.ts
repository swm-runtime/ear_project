import type { LibraryItemStatus, LibrarySource } from '@/features/library';
import type { PlayLimitSnapshot } from '@/features/player';

/** 행의 콘텐츠 — 라이브러리 행과 같은 문법의 표시 정보(explore-api.md 4.1) */
export interface ExploreContent {
  id: string;
  title: string;
  authorName: string;
  sourceName: string;
  /** null이면 E12 [원문 보기]를 노출하지 않는다 — 자리도 남기지 않는다(explore-uiux.md 4.4) */
  sourceUrl: string | null;
  durationSec: number;
  thumbnailUrl: string;
  /** 재발행 판정용(domain.md 5.1) */
  contentVersion: number;
  topicIds: string[];
  /** 콘텐츠 해시태그('#' 없이) — 주제(분류)와 별개인 내용 표시. 없으면 빈 배열(KAN-163) */
  tags: string[];
  /** 콘텐츠 언어(BCP 47 primary — `ko` · `en`). 표시 전용 — 이 값으로 거르지 않는다(global-api.md 4.7). 모르면 null */
  language: string | null;
  /**
   * 시리즈 편이면 그 시리즈 정보, 단일 콘텐츠면 null(explore-api.md 4.1 `content.series` — KAN-134 1단계).
   * 아직 안 보내는 서버(구버전)도 null 로 읽는다. 탐색 행은 이 값으로 모양을 바꾸지 않는다 — 시리즈 화면(편 목록)만 쓴다
   */
  series: ExploreContentSeries | null;
}

/** 편이 속한 시리즈(explore-api.md 4.1 `content.series`) — `totalEpisodes` 는 시리즈 표의 계획 편수다 */
export interface ExploreContentSeries {
  id: string;
  title: string;
  episodeNo: number;
  totalEpisodes: number;
}

/**
 * 이 콘텐츠의 라이브러리 상태 — 담김 표시와 더보기 시트의 담기/제거 분기에 쓴다.
 * null이면 담기지 않은 상태다(explore-api.md 4.1).
 */
export interface ExploreLibraryState {
  itemId: string;
  source: LibrarySource;
  status: LibraryItemStatus;
}

/**
 * 목록의 콘텐츠 행 — 섞인 목록(`ExploreEntry`)의 한 종류다. `type` 은 서버 값 그대로(explore-api.md 4.1-1). 스위치가 꺼진
 * 서버는 `type` 을 보내지 않는데, 그때도 변환 함수가 'content' 로 채운다
 */
export interface ExploreItem {
  type: 'content';
  content: ExploreContent;
  library: ExploreLibraryState | null;
  /** 재생 확인 팝업을 탭 즉시 띄우기 위한 힌트 — 판정이 아니다(library-api.md 4.1과 동일) */
  isCountedToday: boolean;
  /**
   * 완청 — 서버 `is_completed`(KAN-249). 담지 않고 끝까지 들은 편도 true(탐색 재생 자동 적립 폐기 뒤 `library.status` 만으로는
   * 알 수 없다). 클라이언트가 위치로 다시 판정하지 않는다
   */
  isCompleted: boolean;
  /** 검색 결과에만(KAN-238) — 이 항목을 낸 엔진. 화면은 아직 쓰지 않는다('관련' 꼬리표는 다음 결정) */
  matchedBy?: ExploreSearchMatchedBy[];
}

/** 검색 하이브리드(KAN-238)의 엔진·판정 — dto 와 같은 값이고 화면 층에서는 이 이름으로 쓴다 */
export type ExploreSearchMatchedBy = 'keyword' | 'semantic';
export type ExploreSearchEngine = 'keyword' | 'semantic';
export type ExploreSearchMatch = 'keyword' | 'related';

/** 시리즈 상태 — 표시용(ongoing = 연재 중, completed = 완결). 판정에 쓰지 않는다(explore-api.md 4.1-1) */
export type ExploreSeriesStatus = 'ongoing' | 'completed';

/**
 * 시리즈 카드(explore-api.md 4.1-1 — 서버 스위치 `SERIES_EXPLORE_CARDS_ENABLED` 가 켜졌을 때만 온다). 같은 시리즈 편들을 접은
 * 목록의 한 항목이다. 편 단위 상태(담김·오늘 카운트)가 없다 — 탭하면 시리즈 화면이 편마다 준다(explore.md 4.4 예외)
 */
export interface ExploreSeries {
  id: string;
  title: string;
  description: string;
  /** 계획 편수(시리즈 표) */
  totalEpisodes: number;
  /** 지금 사용자 시장에 노출 중인 편 수 — 진행 중 시리즈면 totalEpisodes 보다 적다 */
  episodeCount: number;
  status: ExploreSeriesStatus;
  /** 표지 = 시리즈 표지(관리자가 올린 것)가 있으면 그것, 없으면 노출 중인 가장 앞 편(보통 1화)의 썸네일(KAN-234) */
  thumbnailUrl: string;
  /** 노출 중인 편들의 주제 합집합(처음 나온 순서) — 필터와 무관한 시리즈 전체 값이다 */
  topicIds: string[];
}

export interface ExploreSeriesItem {
  type: 'series';
  series: ExploreSeries;
  /** 검색 결과에만(KAN-238) — 카드로 접힌 편들을 낸 엔진 */
  matchedBy?: ExploreSearchMatchedBy[];
}

/**
 * 탐색 목록의 항목 — 콘텐츠 행과 시리즈 카드가 섞인다(explore-api.md 4.1-1). 피드 섹션·주제별·인기·검색(fallback 포함)이
 * 전부 이 모양이다. 모르는 종류는 변환 함수가 버린다 — 화면에는 이 두 종류만 온다
 */
export type ExploreEntry = ExploreItem | ExploreSeriesItem;

/**
 * 인기 콘텐츠 집계 구간(explore.md 4.1-1) — week·month·all은 전송값이고 화면 라벨은 copy가 가진다.
 * 기본 구간 상수를 클라이언트에 두지 않는다 — 미전송 시 서버가 정하고, 선택 상태는 응답의 period로 그린다.
 */
export type ExplorePeriod = 'week' | 'month' | 'all';

/**
 * 섹션 sectionKey는 분석·로깅용이다 — 화면 분기에 쓰지 않는다(explore-api.md 4.1). 예외 하나: 아는 종류의 **제목 문구**만
 * 표시 언어로 고른다(`explore.section-title.ts` — 섹션 구성·순서·노출은 여전히 서버 응답 그대로).
 * union으로 좁히지 않는 이유: 서버가 무배포로 섹션을 추가할 수 있어야 한다(9장 미결).
 *
 * 계약 필드명은 `key`지만 화면 타입에서는 `sectionKey`로 옮긴다 — RN SectionList가 섹션 객체의
 * `key` 필드를 React key로 소비하는 예약 필드라, 스프레드로 흘러들면 topic_group 섹션끼리
 * 키가 충돌한다(2026-08-08 통합 테스트에서 발견). 화면용 유일 키는 explore.section-key.ts가 만든다.
 */
export interface ExploreSection {
  sectionKey: string;
  /** 서버 제목 — 화면에는 `resolveSectionTitle` 로 그린다(아는 종류는 앱 문구, 그 밖은 이 값 그대로) */
  title: string;
  /** topic_group 섹션만 값이 있다 */
  topic: { id: string; name: string } | null;
  /**
   * popular 섹션만 값이 있다 — 이 섹션이 어느 구간으로 만들어졌는지이며, 구간 토글의
   * 선택 상태를 그리는 근거다(explore-api.md 4.1). key가 아니라 이 값으로 토글 노출을 가른다.
   */
  period: ExplorePeriod | null;
  items: ExploreEntry[];
}

export interface ExploreFeed {
  sections: ExploreSection[];
  /** 라이브러리와 같은 세 필드·같은 규약(explore-api.md 2장) — 피드 조회가 갱신 시점이다 */
  playLimit: PlayLimitSnapshot;
}

export interface ExploreContentsPage {
  items: ExploreEntry[];
  nextCursor: string | null;
  hasNext: boolean;
  playLimit: PlayLimitSnapshot;
}

/** 인기 목록 한 페이지(explore-api.md 4.2-1) — period는 서버가 되돌린 값(토글 선택 상태의 근거)이다 */
export interface ExplorePopularPage {
  period: ExplorePeriod;
  items: ExploreEntry[];
  nextCursor: string | null;
  hasNext: boolean;
  playLimit: PlayLimitSnapshot;
}

/** 검색 빈 결과의 대체 노출(E7) — 같은 응답으로 온다. 빈 화면이 한 박자 늦게 채워지지 않게 한다(explore-api.md 4.5) */
export interface ExploreSearchFallback {
  relatedTopics: { id: string; name: string }[];
  popularItems: ExploreEntry[];
}

/**
 * 검색 결과 한 페이지(explore-api.md 4.5) — 행은 피드와 같은 문법(ExploreItem)이다.
 * 잔여 표시값이 없다 — 검색 화면은 표시를 숨긴다(explore.md 4.4-1).
 */
export interface ExploreSearchPage {
  items: ExploreEntry[];
  nextCursor: string | null;
  hasNext: boolean;
  /** items가 있으면 null — 빈 결과일 때만 값이 있다 */
  fallback: ExploreSearchFallback | null;
  /** 실제 검색에 쓴 질의(KAN-238) — 옛 서버는 보내지 않아 null 일 수 있다 */
  queryUsed: string | null;
  /** 서버가 오타를 교정해 "대신 검색"했으면 원문 — "혹시 ‘OO’로 검색하고 싶나요?"의 근거(KAN-239). 없으면 null */
  correctedFrom: string | null;
  /** 첫 페이지에 키워드로 맞은 편이 없으면 `related` — "‘OO’와 관련된 결과예요"의 유일한 근거. 옛 서버는 `keyword` */
  match: ExploreSearchMatch;
  engines: ExploreSearchEngine[];
}

/**
 * 주제 칩 항목 — 정렬은 서버 소유다(explore-api.md 4.2-2). 관심 주제(선택 순서)가 앞쪽이며
 * 클라이언트는 재배열하지 않는다. isInterest는 관심 주제 칩을 시각적으로 구분할 근거다.
 */
export interface ExploreTopic {
  id: string;
  name: string;
  isInterest: boolean;
}

export type SaveReason = 'user_save' | 'auto_play';

/**
 * 담기 응답(explore-api.md 4.3)의 도메인 모델 — libraryItem은 버튼 전환·삭제 호출 재료다.
 * 콘텐츠 상세 화면도 이 계약을 그대로 재사용한다(content-detail-api.md 4.2 — 신규 계약 없음).
 */
export interface SaveContentResult {
  clientSeq: number;
  libraryItem: {
    itemId: string;
    source: LibrarySource;
    status: LibraryItemStatus;
    addedAt: string;
  };
}

/** 편의 재생 위치(explore-api.md 4.7 `progress`) — 재생 위치 행이 없으면 null 이다(0 으로 채우지 않는다) */
export interface SeriesEpisodeProgress {
  positionSec: number;
  maxReachedSec: number;
}

/**
 * 시리즈 화면의 편 한 줄(explore-api.md 4.7 `episodes[]`) — 행 동작(재생·더보기)은 탐색 행과 같으므로 콘텐츠 행
 * (`ExploreItem`)을 그대로 품는다. 상태(담음·완청·재생 위치)는 전부 서버 값이다
 */
export interface SeriesEpisode {
  episodeNo: number;
  item: ExploreItem;
  progress: SeriesEpisodeProgress | null;
}

/** GET /series/:series_id(explore-api.md 4.7) — 편은 노출 중인 것만, episode_no 오름차순(서버 정렬 그대로) */
export interface SeriesDetail {
  series: {
    id: string;
    title: string;
    description: string;
    totalEpisodes: number;
    status: ExploreSeriesStatus;
    thumbnailUrl: string;
    /** 대표 중분류(주제) — 제목 아래 카테고리 줄. 서버가 안 주면 null(줄째 생략) */
    topic: { id: string; name: string } | null;
    /** 발행일자(ISO 8601 순간) — 앨범 화면 하단 발행일. 구버전 서버는 안 보내므로 null(줄째 생략) */
    publishedAt: string | null;
    /** 발행 이름(예: "키워드") — 제목 바로 아래 줄(애플 뮤직 아티스트 자리). 없거나 구버전 서버면 null(줄째 생략) */
    publisherName: string | null;
    /**
     * 시리즈째 담았는가(KAN-246) — 시리즈 화면 담기/빼기 버튼의 근거. 편이 다 담겼는지와 다르다: 편을 하나씩 다 담아도 false,
     * 시리즈째 담은 뒤 편 하나를 따로 빼도 true. true 면 새 편이 라이브러리에 따라 들어온다(서버)
     */
    isSaved: boolean;
  };
  episodes: SeriesEpisode[];
}
