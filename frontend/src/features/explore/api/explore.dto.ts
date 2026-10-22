/**
 * 서버 통신 DTO — explore-api.md의 요청·응답을 snake_case 그대로 선언한다(convention.md 5.1).
 * camelCase 변환은 explore.api.ts 안에서만 일어난다.
 */
import type { LibraryItemStatus, LibrarySource } from '@/features/library';
import type { PlayLimitFieldsDto } from '@/features/player';

import type { ExplorePeriod, ExploreSeriesStatus } from '../explore.types';

export interface ExploreContentDto {
  id: string;
  title: string;
  /** AI 생성 콘텐츠는 null 일 수 있다(explore-api.md 4.7 예시) — 화면 모델에서는 빈 문자열로 읽는다 */
  author_name: string | null;
  source_name: string;
  /**
   * E12 [원문 보기] 노출 근거(explore.md 4.3 — 확정 2026-08-10, null이면 미노출).
   * TODO(계약 제안): explore-api.md 목록 행 미반영 — changes/pending 기록. mock에만 구현되어 있다.
   */
  source_url: string | null;
  duration_sec: number;
  thumbnail_url: string;
  content_version: number;
  topic_ids: string[];
  /**
   * 화면 해시태그('#' 없이, 2~4개 — explore-api.md 4.1 `content.tags`, KAN-162). 없으면 빈 배열.
   * 선택 필드 — 아직 안 보내는 서버에서는 없고, 그때는 빈 배열로 읽는다
   */
  tags?: string[];
  /**
   * 콘텐츠 언어(BCP 47 primary — `ko` · `en`, global-api.md 4.7). **표시 전용** — 목록을 거르지 않는다(시장 필터는 서버 몫).
   * 아직 안 보내는 서버에서는 없다 — 없으면 null 로 읽는다
   */
  language?: string | null;
  /**
   * 시리즈 편이면 `{ id, title, episode_no, total_episodes }`, 단일 콘텐츠면 null(explore-api.md 4.1 — KAN-134 1단계).
   * 추가 필드라 아직 안 보내는 서버에서는 없다 — 없으면 null 로 읽는다
   */
  series?: ExploreContentSeriesDto | null;
}

export interface ExploreContentSeriesDto {
  id: string;
  title: string;
  episode_no: number;
  /** 시리즈 표의 계획 편수(domain.md 5.9) */
  total_episodes: number;
}

export interface ExploreLibraryStateDto {
  item_id: string;
  source: LibrarySource;
  status: LibraryItemStatus;
}

/**
 * 콘텐츠 행. 서버 스위치 `SERIES_EXPLORE_CARDS_ENABLED` 가 꺼져 있으면 `type` 키가 **없다**(explore-api.md 4.1-1) —
 * 없으면 콘텐츠 행으로 읽는다
 */
export interface ExploreItemDto {
  type?: 'content';
  content: ExploreContentDto;
  /** 없으면 null — 라이브러리에 담기지 않은 상태다(explore-api.md 4.1) */
  library: ExploreLibraryStateDto | null;
  is_counted_today: boolean;
}

/** 시리즈 카드(explore-api.md 4.1-1 — 스위치 켬에만). 편 단위 상태(`library`·`is_counted_today`)가 없다 */
export interface ExploreSeriesCardDto {
  type: 'series';
  series: {
    id: string;
    title: string;
    description: string;
    /** 계획 편수(시리즈 표) */
    total_episodes: number;
    /** 지금 사용자 시장에 노출 중인 편 수 — 진행 중 시리즈면 total_episodes 보다 적다 */
    episode_count: number;
    status: ExploreSeriesStatus;
    /** 표지 = 노출 중인 가장 앞 편(보통 1화)의 썸네일 */
    thumbnail_url: string;
    /** 노출 중인 편들의 주제 합집합(처음 나온 순서) */
    topic_ids: string[];
  };
}

/**
 * 탐색 목록의 항목 — 콘텐츠 행과 시리즈 카드가 섞인다(explore-api.md 4.1-1). 서버가 새 `type` 을 더할 수 있으므로
 * 변환 함수는 `type` 을 문자열로 다시 읽어 모르는 값을 버린다(타입에 없는 값도 런타임에는 올 수 있다)
 */
export type ExploreEntryDto = (ExploreItemDto | ExploreSeriesCardDto) & {
  /** 검색 응답에만(KAN-238) — 이 항목을 낸 엔진. 콘텐츠 행·시리즈 카드 공통 */
  matched_by?: ExploreSearchMatchedBy[];
};

export interface ExploreSectionDto {
  /** interest / new / popular / topic_group — 분석·로깅용. 화면 분기에 쓰지 않는다 */
  key: string;
  title: string;
  topic: { id: string; name: string } | null;
  /** popular 섹션만 값이 있다 — 구간 토글 선택 상태의 근거. 다른 섹션은 생략 또는 null(explore-api.md 4.1) */
  period?: ExplorePeriod | null;
  items: ExploreEntryDto[];
}

/** GET /explore/feed (explore-api.md 4.1) */
export interface ExploreFeedResponseDto extends PlayLimitFieldsDto {
  sections: ExploreSectionDto[];
}

/** GET /explore/contents (explore-api.md 4.2) */
export interface ExploreContentsRequestDto {
  /** uuid 콤마 구분, 1개 이상 필수. 다중이면 OR 조합 — 앱은 2026-10-09 부터 하나만 보낸다(칩 단일 선택) */
  topic_ids: string;
  cursor?: string;
  limit?: number;
}

export interface ExploreContentsResponseDto extends PlayLimitFieldsDto {
  items: ExploreEntryDto[];
  next_cursor: string | null;
  has_next: boolean;
}

/** GET /explore/popular (explore-api.md 4.2-1) — period 미전송이면 서버가 month로 해석한다 */
export interface ExplorePopularRequestDto {
  period?: ExplorePeriod;
  cursor?: string;
  limit?: number;
}

export interface ExplorePopularResponseDto extends PlayLimitFieldsDto {
  /** 서버가 되돌린 값 — 토글 선택 상태의 근거. 기본값을 클라이언트가 알 필요가 없게 한다 */
  period: ExplorePeriod;
  items: ExploreEntryDto[];
  next_cursor: string | null;
  has_next: boolean;
}

/** POST /contents/:content_id/save (explore-api.md 4.3) */
export interface SaveContentRequestDto {
  /** 담기·해제 조작의 클라이언트 단조 증가 순번 — 서버는 저장·판정하지 않고 되돌린다 */
  client_seq: number;
  /** auto_play는 탐색 재생 자동 적립(4.6) — user_signals 적재 여부만 가른다 */
  reason?: 'user_save' | 'auto_play';
}

export interface SaveContentResponseDto extends PlayLimitFieldsDto {
  library_item: {
    id: string;
    source: LibrarySource;
    status: LibraryItemStatus;
    added_at: string;
  };
  client_seq: number;
}

/** DELETE /contents/:content_id/save (explore-api.md 4.4) */
export interface UnsaveContentResponseDto {
  client_seq: number;
}

/** GET /explore/search (explore-api.md 4.5) — 트림 후 2자 이상 질의만 보낸다(클라이언트 필터는 UX, 판정은 서버 방어선) */
export interface ExploreSearchRequestDto {
  query: string;
  /** 검색 결과에 주제 필터를 겹칠 때 — uuid 콤마 구분(선택). 현재 화면에는 필터 UI가 없다 */
  topic_ids?: string;
  cursor?: string;
  limit?: number;
  /**
   * `true`면 서버가 오타 교정("대신 검색")을 하지 않는다 — "원본 검색 ‘OO’" 탭이 보내는 값(KAN-239).
   * 기본 false. `#` 질의에는 의미 없음
   */
  exact?: boolean;
}

/** 검색 결과 한 항목을 낸 엔진(KAN-238 하이브리드) — 화면은 아직 쓰지 않는다. 타일 '관련' 꼬리표의 근거로만 남는다 */
export type ExploreSearchMatchedBy = 'keyword' | 'semantic';
/** 이 응답을 만든 엔진 — AI 서버가 늦거나 빠지면 `semantic`이 없다. 진단·로그 대조용 */
export type ExploreSearchEngine = 'keyword' | 'semantic';
/**
 * 첫 페이지에 키워드로 맞은 편이 하나라도 있으면 `keyword`, 없으면(의미 결과만) `related` — "‘OO’와 관련된 결과예요"의
 * 유일한 근거. 교정된 응답은 항상 `keyword`다(교정은 교정어로 키워드 1건 이상일 때만 — explore.md 4.5-5)
 */
export type ExploreSearchMatch = 'keyword' | 'related';

/** 빈 결과의 대체 노출(E7) — 같은 응답으로 온다. items가 있으면 fallback은 null이다(explore-api.md 4.5) */
export interface ExploreSearchFallbackDto {
  /** 쿼리와 유사한 주제 — 칩으로 노출, 탭 시 그 주제의 단일 목록(4.2)으로 이동 */
  related_topics: { id: string; name: string }[];
  /** 인기 콘텐츠(직전 확정 구간 기준 — domain.md 5.4) */
  popular_items: ExploreEntryDto[];
}

/**
 * 검색 응답 — 행 모양은 4.1의 items[]와 완전히 같다("피드 행과 같은 문법").
 * 잔여 재생 표시값을 싣지 않는다(explore-api.md 2장) — 검색 화면은 표시를 숨긴다.
 */
export interface ExploreSearchResponseDto {
  items: ExploreEntryDto[];
  next_cursor: string | null;
  has_next: boolean;
  fallback: ExploreSearchFallbackDto | null;
  /*
   * ── KAN-238(하이브리드·교정)부터 덧붙는 필드 — 옛 서버는 보내지 않아 전부 선택이다. 없으면 "교정 없음·키워드 결과"로 본다 ──
   */
  /** 실제 검색에 쓴 정규화 질의 — 교정 없으면 입력의 정규화 값 */
  query_used?: string;
  /** 교정했으면 원문(정규화 값), 아니면 null — "원본 검색 ‘OO’" 자리 */
  corrected_from?: string | null;
  match?: ExploreSearchMatch;
  engines?: ExploreSearchEngine[];
}

/**
 * GET /contents/:content_id/related (player-api.md 4.8 — KAN-240) — 지금 듣는 편과 대본 임베딩이 비슷한 편.
 * 행은 탐색 4.1 콘텐츠 행과 같고 `type` 키·시리즈 카드가 없다. 기준 편에 임베딩이 없으면 `items: []`
 */
export interface RelatedContentsResponseDto {
  items: ExploreItemDto[];
}

/**
 * GET /explore/topics (explore-api.md 4.2-2) — 확정 계약(합의 2026-08-07).
 * 앞쪽은 활성 관심 주제 전부(선택 순서, 숨김 처리돼도 포함), 뒤쪽은 노출 주제(display_order 순).
 * 정렬은 서버 소유다 — 클라이언트는 재배열하지 않는다.
 */
export interface ExploreTopicsResponseDto {
  topics: { id: string; name: string; is_interest: boolean }[];
}

/** 편 한 줄(explore-api.md 4.7 `episodes[]`) — content 는 탐색 행의 content 와 같은 모양이다 */
export interface SeriesEpisodeDto {
  episode_no: number;
  content: ExploreContentDto;
  /** 담지 않았으면 null. 완청 = status "completed" */
  library: ExploreLibraryStateDto | null;
  /** 재생 위치 행이 없으면 null(0 으로 채우지 않는다) */
  progress: { position_sec: number; max_reached_sec: number } | null;
  /** 재생 확인 팝업 힌트 — 판정이 아니다 */
  is_counted_today: boolean;
}

/**
 * GET /series/:series_id (explore-api.md 4.7) — 편은 노출 중인 것만(published·라이선스 유효·사용자 시장), episode_no 오름차순.
 * 없는·다른 시장·노출 편 0개 시리즈는 404 NOT_FOUND 다. 다음 화(`next_episode`)·페이지는 두지 않는다
 */
export interface SeriesDetailResponseDto {
  series: {
    id: string;
    title: string;
    description: string;
    /** 계획 편수 — episodes 는 노출 중인 편만이라 이보다 적을 수 있다 */
    total_episodes: number;
    status: ExploreSeriesStatus;
    /** 표지 = 노출 중인 가장 앞 편(보통 1화)의 썸네일 */
    thumbnail_url: string;
    /**
     * 대표 중분류(주제) — 앨범 화면 제목 아래 카테고리 줄(2026-10-22). 서버(series-detail)가 편들의 주제 중 대표 하나를
     * 골라 싣는다(explore-api.md 4.7). 추가 필드라 보내지 않는 서버(구버전)·값이 없는 시리즈는 `null`/부재로 두고,
     * 화면은 줄째 생략한다
     */
    topic?: { id: string; name: string } | null;
    /** 발행일자(ISO 8601) — 노출 편 중 가장 이른 발행 시각. 추가 필드라 구버전 서버는 부재(화면은 줄째 생략) */
    published_at?: string | null;
    /** 시리즈째 담았는가(library_series — KAN-245). 추가 필드라 구버전 서버는 부재 → false */
    is_saved?: boolean;
  };
  episodes: SeriesEpisodeDto[];
}

/** POST /series/:series_id/save (explore-api.md 4.8) */
export interface SaveSeriesResponseDto {
  series_id: string;
  added_count: number;
  client_seq: number;
}

/** DELETE /series/:series_id/save (explore-api.md 4.9) */
export interface UnsaveSeriesResponseDto {
  series_id: string;
  removed_item_ids: string[];
  client_seq: number;
}

/** POST /series/:series_id/restore (explore-api.md 4.10) */
export interface RestoreSeriesResponseDto {
  series_id: string;
  restored_item_ids: string[];
  is_saved: boolean;
}
