/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

import { StatsPeriodType } from './content.enum';
import { Content } from './entities/content.entity';

/** 추천·편성 후보 조회 조건 */
export interface ContentCandidateQuery {
  /** 이 주제 중 하나라도 걸리는 콘텐츠만. 비우면 주제 조건을 적용하지 않는다 */
  includeTopicIds?: string[];
  /** 이 주제에 걸리는 콘텐츠는 제외한다 (관심 주제 밖에서 뽑을 때) */
  excludeTopicIds?: string[];
  excludeContentIds?: string[];
  /**
   * 시리즈 중간 편을 후보에서 뺀다(`episode_no`가 없거나 1인 것만).
   * 1편을 듣지 않은 사용자에게 3편을 적립하지 않기 위한 조건이다
   * (`drip-scheduling.md` 7).
   */
  seriesStartOnly?: boolean;
  limit: number;
  now: Date;
}

/** 콘텐츠에 붙은 주제 — 클라이언트가 주제 배지를 그리는 데 쓴다 */
export interface ContentTopicView {
  contentId: string;
  topicId: string;
  name: string;
}

/**
 * 탐색 필터 목록의 커서 위치(explore-api.md 4.2).
 *
 * **정렬 키 세 값을 모두 담는다.** 랭킹 1순위(전체 구간 재생 수)만으로는 동점 구간의 순서가
 * 정해지지 않아 페이지 경계에서 항목이 반복되거나 사라진다 — 초기 콘텐츠 풀에서는 재생 수가
 * 전부 0이라 동점이 예외가 아니라 기본값이다(PRD 8.1).
 */
export interface ExploreCursorPosition {
  playCount: number;
  publishedAt: Date;
  id: string;
}

export interface ExplorePageQuery {
  /** 비울 수 없다. 필터가 없는 상태는 피드(4.1)가 담당한다. **주제끼리는 OR다** */
  topicIds: string[];
  cursor: ExploreCursorPosition | null;
  limit: number;
  now: Date;
}

/**
 * 랭킹 값이 붙은 콘텐츠 한 줄.
 *
 * `playCount`를 함께 돌려주는 이유는 **커서가 정렬 키를 담아야 하기 때문이다.** 이 값은
 * `content_stats` 조인 결과이지 `contents`의 컬럼이 아니라(domain.md 1.5), Entity에 실어
 * 보낼 자리가 없다.
 */
export interface RankedContent {
  content: Content;
  playCount: number;
}

export interface ExplorePage {
  items: RankedContent[];
  /** 다음 페이지 존재 여부. `false`면 커서를 발급하지 않는다 */
  hasNext: boolean;
}

/**
 * 인기 목록의 커서 위치(explore-api.md 4.2-1).
 *
 * **정렬 키 네 값을 모두 담는다.** 인기 랭킹은 그 구간의 재생 수 → 완청 수 → 신선도 순인데,
 * 확정 구간이 없는 배포 첫 주·첫 달에는 앞의 두 값이 전부 0이라 **동점이 기본값**이다
 * (`explore.md` 4.1-1). 뒤의 두 키가 없으면 페이지 경계에서 항목이 반복되거나 사라진다.
 */
export interface PopularCursorPosition {
  playCount: number;
  completeCount: number;
  publishedAt: Date;
  id: string;
}

export interface PopularPageQuery {
  /** 사용자가 고른 집계 구간. `period_start`는 `ContentService`가 이 값으로 환산한다 */
  periodType: StatsPeriodType;
  cursor: PopularCursorPosition | null;
  limit: number;
  now: Date;
}

/** 인기 랭킹의 정렬 키가 붙은 콘텐츠 한 줄 — 커서 발급에 쓴다 */
export interface RankedPopularContent {
  content: Content;
  playCount: number;
  completeCount: number;
}

export interface PopularPage {
  items: RankedPopularContent[];
  hasNext: boolean;
}

/**
 * 검색 목록의 커서 위치(explore-api.md 4.5).
 *
 * **정렬 키 다섯 값을 모두 담는다** — 매칭 필드 가중 합(1순위)과 동점 해소 체인
 * (제목 유사도 → 인기 → 신선도 — `explore.md` 4.5-5) 전부다. 초기 콘텐츠 풀에서는
 * 집계가 전부 0이라 동점이 기본값이므로(PRD 8.1), 키가 하나라도 빠지면 페이지 경계에서
 * 항목이 반복되거나 사라진다.
 */
export interface SearchCursorPosition {
  /** 매칭 필드 가중 합 — 정수다(`content.constant.ts`의 2^n 가중치 합산) */
  score: number;
  /**
   * 제목 `word_similarity` — SQL에서 `double precision`으로 캐스팅해 읽는다.
   * `real`(4바이트) 그대로 커서에 실으면 float8 파라미터와의 재비교에서 어긋난다.
   */
  titleSimilarity: number;
  /** 직전 확정 월의 재생 수 (`domain.md` 5.4 — 순위는 직전 확정 구간을 쓴다) */
  playCount: number;
  publishedAt: Date;
  id: string;
}

export interface SearchPageQuery {
  /** **이미 정규화된 질의다**(NFC + 소문자 + 트림 — `explore.md` 4.5-5). 호출부가 정규화한다 */
  normalizedQuery: string;
  /** 검색 결과에 주제 필터를 겹칠 때(explore-api.md 4.5). 비우면 조건을 적용하지 않는다 */
  topicIds: string[];
  cursor: SearchCursorPosition | null;
  limit: number;
  now: Date;
}

/** 검색 랭킹의 정렬 키가 붙은 콘텐츠 한 줄 — 커서 발급에 쓴다 */
export interface RankedSearchContent {
  content: Content;
  score: number;
  titleSimilarity: number;
  playCount: number;
}

export interface SearchPage {
  items: RankedSearchContent[];
  hasNext: boolean;
}
