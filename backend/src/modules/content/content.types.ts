/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

import { YearsOfExperienceRange } from '@/modules/user/user.enum';

import {
  AudioQuality,
  ContentDifficulty,
  ContentFormat,
  ContentLanguage,
  ContentLengthProfile,
  ContentOrigin,
  ContentStatus,
  SeriesStatus,
  StatsPeriodType,
} from './content.enum';
import { Content } from './entities/content.entity';
import { UserMarket } from '@/modules/user/user.enum';

/** 추천·편성 후보 조회 조건 */
export interface ContentCandidateQuery {
  /** 사용자 시장(`global-api.md` 4.7) — 다른 시장의 콘텐츠는 후보가 아니다 */
  market: UserMarket;
  /** 이 주제 중 하나라도 걸리는 콘텐츠만. 비우면 주제 조건을 적용하지 않는다 */
  includeTopicIds?: string[];
  /** 이 주제에 걸리는 콘텐츠는 제외한다 (관심 주제 밖에서 뽑을 때) */
  excludeTopicIds?: string[];
  /**
   * **이 요청 안에서만 제외할 것들** — 방금 뽑은 정규 편성분을 탐험 슬롯에서 빼는 식이다.
   * 사용자의 누적 이력은 아래 `excludeSeenByUserId`가 SQL에서 처리한다.
   */
  excludeContentIds?: string[];
  /**
   * **이미 본 것을 SQL에서 뺀다**(`domain.md` 7 후보 필터) — `library_items`(삭제 여부 무관)
   * 또는 `drip_excluded_contents`에 행이 있으면 후보가 아니다.
   *
   * 이 목록을 애플리케이션에서 만들어 `NOT IN`으로 넘기지 않는다. 계정 수명 동안 단조
   * 증가하는 값이라(재생·적립·해제·삭제 무엇도 정리되지 않는다) 바인딩 파라미터 상한
   * (65,535)에 다가가고, 그 전에 실행 계획이 무너진다. 존재 검사는 인덱스가 있다.
   */
  excludeSeenByUserId?: string;
  /**
   * 시리즈 중간 편을 후보에서 뺀다(`episode_no`가 없거나 1인 것만).
   * 1편을 듣지 않은 사용자에게 3편을 적립하지 않기 위한 조건이다
   * (`drip-scheduling.md` 7).
   */
  seriesStartOnly?: boolean;
  /**
   * **저노출·신규를 먼저 뽑는다**(`drip-scheduling.md` 4.8-2 — 탐험 슬롯).
   *
   * 기본 정렬은 인기순인데, 탐험 슬롯은 그 반대를 원한다. 같은 풀을 쓰면 **가장 많이
   * 재생된 300건 안에서 저노출을 고르게 되어**, 카탈로그가 그 수를 넘는 순간 저노출
   * 콘텐츠는 후보에 들어오지도 못한다 — 4.8이 깨려던 콘텐츠 콜드스타트 고리가 그대로 남는다.
   */
  lowExposureFirst?: boolean;
  /**
   * **무작위로 자른다**(KAN-291 — 첫 드립 무작위 실험, `FIRST_DRIP_RANDOM_ENABLED`). 기본 정렬은 인기순이라 `limit`으로
   * 자르면 카탈로그가 상한을 넘는 순간 인기 하위 편은 무작위 선정의 후보에 들어오지도 못한다. 켜면 `ORDER BY random()`으로
   * 자른다 — 결과 순서는 의미가 없고, 최종 선정은 호출자가 주입한 난수로 한다. `lowExposureFirst`와 함께 쓰지 않는다
   */
  randomOrder?: boolean;
  limit: number;
  now: Date;
}

/**
 * 검증을 통과한 `enrichment.json`(`ai/metadata-pipeline.md` 4.4)의 저장 입력.
 * 생략된 키는 저장하지 않는다 — 결손은 스코어링 중립 처리다(domain.md 5.1·5.6).
 */
/**
 * 이 콘텐츠가 맞는 청자 — (직군, 연차 구간) 한 쌍. 값 집합은 온보딩 커리어 입력과 같다
 * (`JOB_CATEGORIES` · `YearsOfExperienceRange`) — 그래야 사용자 프로필과 그대로 대조된다
 * (`drip-scheduling.md` 4.2 ③ 커리어 적합도, domain.md 5.1 — 신설 2026-09-11).
 */
export interface TargetAudience {
  jobCategory: string;
  yearsOfExperience: YearsOfExperienceRange;
}

export interface EnrichmentInput {
  /** `enrichment.json`의 `schema_version`. 생략된 구형 파일은 1 (`CURRENT_ENRICHMENT_SCHEMA_VERSION`) */
  schemaVersion: number;
  difficulty?: ContentDifficulty;
  format?: ContentFormat;
  isEvergreen?: boolean;
  keywords?: string[];
  targetAudiences?: TargetAudience[];
  /** 화면 해시태그 — 형식 3부터 (`MIN_CONTENT_TAGS`~`MAX_CONTENT_TAGS`개) */
  tags?: string[];
  embedding?: { model: string; vector: number[] };
}

/**
 * 대본 세그먼트 한 턴(domain.md 5.3, `player-api.md` 4.7). **키는 snake_case다** — jsonb에 그대로 저장되고 API 응답에도
 * 그대로 나가는 형상이라 변환 경계(DTO)를 두지 않는다(`duration_pref`와 같은 규칙). 시각은 초(소수 허용), 최종 배포본 기준.
 */
export interface ScriptSegment {
  start_sec: number;
  end_sec: number;
  /** 화자 표시명("윤아"·"이음"). 1인 낭독·파트너 콘텐츠는 null */
  speaker: string | null;
  text: string;
}

/**
 * 구간 제목(`player-api.md` 4.1 `sections`, KAN-144) — 대본의 `### #n 제목` 구간 그대로. 시작 시각은
 * 세그먼트와 같은 배포본 기준이라 자막과 운명이 같다(같은 행, 같은 교체·삭제). 끝 시각은 없다 —
 * 다음 구간의 시작이 곧 끝이고, 현재 구간은 `start_sec ≤ 재생 위치`인 마지막 항목이다.
 */
export interface ScriptSection {
  start_sec: number;
  title: string;
  /**
   * 구역(KAN-151, 2026-10-07) — 플레이어 구간 카드의 "개요 · 본론 · 결론" 라벨 근거. 없으면 키 자체가 없다(종전 파일).
   * 앱은 없거나 모르는 값이면 종전 표시로 돌아간다
   */
  kind?: ScriptSectionKind;
  /** 카드 아래 한 줄 요약(KAN-151). 비어 있지 않은 ≤40자. 없으면 키 자체가 없다 — 앱은 title 로 대신한다 */
  summary?: string;
}

/** 구간의 구역 — 파이프라인 대본 구조(인트로 · 도입 · 본문 단락들 · 마무리)를 그대로 옮긴 네 값 */
export type ScriptSectionKind = 'intro' | 'lead' | 'body' | 'outro';
export const SCRIPT_SECTION_KINDS: readonly ScriptSectionKind[] = [
  'intro',
  'lead',
  'body',
  'outro',
];

/** `content_scripts` 한 행의 내용 — `script_file`이 담는 것(admin-api.md 4.6) */
export interface ScriptDocument {
  segments: ScriptSegment[];
  /** 구간이 없는 대본(배열 형식 파일·파트너 콘텐츠)은 빈 배열 */
  sections: ScriptSection[];
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
  /** 사용자 시장(`global-api.md` 4.7) — 다른 시장의 콘텐츠는 후보가 아니다 */
  market: UserMarket;
  /** 비울 수 없다. 필터가 없는 상태는 피드(4.1)가 담당한다. **주제끼리는 OR다** */
  topicIds: string[];
  cursor: ExploreCursorPosition | null;
  limit: number;
  now: Date;
  /** 시리즈 카드 모드(KAN-134 — `SERIES_EXPLORE_CARDS_ENABLED`) — 시리즈마다 순위가 가장 높은 편 하나만 남긴다(`applySeriesAnchors`) */
  seriesAnchorsOnly?: boolean;
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
  /** 사용자 시장(`global-api.md` 4.7) — 다른 시장의 콘텐츠는 후보가 아니다 */
  market: UserMarket;
  /** 사용자가 고른 집계 구간. `period_start`는 `ContentService`가 이 값으로 환산한다 */
  periodType: StatsPeriodType;
  cursor: PopularCursorPosition | null;
  limit: number;
  now: Date;
  /** 시리즈 카드 모드(KAN-134 — `SERIES_EXPLORE_CARDS_ENABLED`) — 시리즈마다 순위가 가장 높은 편 하나만 남긴다(`applySeriesAnchors`) */
  seriesAnchorsOnly?: boolean;
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
  /** 사용자 시장(`global-api.md` 4.7) — 다른 시장의 콘텐츠는 후보가 아니다 */
  market: UserMarket;
  /**
   * **이미 정규화된 검색어다**(NFC + 소문자 + 트림 — `explore.md` 4.5-5). 호출부가 정규화하고,
   * 태그 전용 검색이면 앞의 `#`을 뗀 값이다(`parseSearchQuery`)
   */
  normalizedQuery: string;
  /** `#`으로 시작한 질의 — 태그 정확 일치만 결과로 낸다(KAN-218) */
  tagOnly: boolean;
  /** 시리즈 제목 일치도 결과로 낸다 — 탐색 시리즈 카드 스위치가 켜졌을 때만(KAN-134). 생략·false면 종전 그대로 */
  matchSeriesTitle?: boolean;
  /** 시리즈 카드 모드(KAN-134 — `SERIES_EXPLORE_CARDS_ENABLED`) — 시리즈마다 순위가 가장 높은 편 하나만 남긴다(`applySeriesAnchors`) */
  seriesAnchorsOnly?: boolean;
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

/** 검색 엔진 이름(KAN-238 — explore-api.md 4.5 `engines`·`items[].matched_by`) */
export type SearchEngine = 'keyword' | 'semantic';

/**
 * 하이브리드 검색 커서 위치 — RRF 순서(KAN-238). 최종 정렬 키 — RRF 점수 → 직전 확정 월 재생 수 → `published_at` → id 를 전부 담는다.
 * RRF 점수는 SQL에서 `double precision`으로 계산·비교하고 JSON 왕복도 float8 그대로라 키셋 재비교가 어긋나지 않는다
 */
export interface RrfSearchCursorPosition {
  order: 'rrf';
  rrf: number;
  playCount: number;
  publishedAt: Date;
  id: string;
}

/**
 * 하이브리드 검색 커서 위치 — 키워드 순서(KAN-242). 질의 벡터 없이 시작한 검색은 종전 키워드 검색 그대로 줄 세우므로 커서도
 * 종전 키워드 정렬 키 다섯(`SearchCursorPosition`)을 담는다. 키가 전부 행 자기 값이라 페이지 사이 발행·삭제에도 경계가 밀리지
 * 않는다(RRF 점수는 매칭 집합 안의 순위라 앞쪽 행이 늘고 줄면 같은 행의 값이 바뀐다)
 */
export interface KeywordOrderSearchCursorPosition extends SearchCursorPosition {
  order: 'keyword';
}

/** 하이브리드 검색 커서 위치 — 어느 정렬로 이은 페이지인가(`order`)로 가른다 */
export type HybridSearchCursorPosition =
  RrfSearchCursorPosition | KeywordOrderSearchCursorPosition;

export interface HybridSearchPageQuery {
  market: UserMarket;
  /** 실제 검색어 — 정규화 끝난 값(원문 또는 교정어) */
  normalizedQuery: string;
  /**
   * 질의 임베딩(`EMBEDDING_MODEL_ID` · `EMBEDDING_DIM`). `null`이면 의미 엔진을 생략한다(AI 서버 결손·미설정) —
   * 그때 커서가 RRF 순서가 아니면 **종전 키워드 검색(`findSearchPage`)에 그대로 맡긴다**(KAN-242 — 결과·순서·커서가 구조적으로 같다)
   */
  queryVector: number[] | null;
  matchSeriesTitle?: boolean;
  seriesAnchorsOnly?: boolean;
  topicIds: string[];
  cursor: HybridSearchCursorPosition | null;
  limit: number;
  now: Date;
}

export interface RankedHybridContent {
  content: Content;
  /** 이 행에서 다음 페이지를 잇는 커서 위치 — 페이지를 만든 정렬(RRF·키워드)의 키다 */
  position: HybridSearchCursorPosition;
  /** 어느 엔진에서 왔는가 — 시리즈 카드 모드면 같은 시리즈의 접힌 편까지 합친 값이다(카드가 시리즈를 대표한다) */
  matchedBy: SearchEngine[];
}

export interface HybridSearchPage {
  items: RankedHybridContent[];
  hasNext: boolean;
  /**
   * 키워드 엔진이 맞힌 편이 하나라도 있는가(접기 전) — 첫 페이지에서 거짓이면 교정어 탐색의 조건이다. 커서 페이지는 앞 페이지가
   * 있었다는 뜻이라 교정 판정에 쓰지 않는다
   */
  keywordMatched: boolean;
}

/** 교정어 후보 — SQL이 길이 가드·트라이그램으로 줄여 넘기고 `pickSearchCorrection`이 재채점한다 */
export interface SearchCorrectionCandidate {
  term: string;
  /** 0 = 태그·주제명(깨끗한 명사), 1 = 시리즈 제목·제목 토큰 */
  priority: number;
  /** 어휘에 나온 횟수 */
  frequency: number;
}

/**
 * 관련 콘텐츠 조회(KAN-240 — `player-api.md` 4.8). 기준 편은 이미 노출·시장 판정을 통과한 편이다(Service가 먼저 본다)
 */
export interface RelatedContentQuery {
  baseContentId: string;
  market: UserMarket;
  /** 결과에서 뺄 편 — 재생 목록 스냅샷에 이미 있는 편. 기준 편은 따로 빠진다 */
  excludeIds: string[];
  limit: number;
  now: Date;
}

export interface SearchCorrectionQuery {
  market: UserMarket;
  normalizedQuery: string;
  /** 시리즈 제목도 어휘에 넣는다 — 탐색 시리즈 카드 스위치가 켜졌을 때만(키워드 엔진과 같은 조건) */
  includeSeriesTitles: boolean;
  now: Date;
}

/** admin.md 3.1 — 업로드 입력 중 저장소 처리가 끝난 뒤 content 모듈이 받는 값 */
export interface PublishContentCommand {
  /** 시장·언어(`global-api.md` 4.9) — 노출 격리의 입력. 호출부(admin)가 검증을 끝내고 넘긴다 */
  market: UserMarket;
  language: ContentLanguage;
  title: string;
  description: string;
  origin: ContentOrigin;
  authorName: string | null;
  sourceName: string;
  sourceUrl: string | null;
  partnerId: string | null;
  licenseExpiresAt: Date | null;
  seriesId: string | null;
  episodeNo: number | null;
  totalEpisodes: number | null;
  audioPath: string;
  durationSec: number;
  thumbnailUrl: string;
  topicIds: string[];
  /** `ai_generated`만. 배열 순서가 곧 `position`이다 (domain.md 5.5) */
  sources: { title: string; author: string | null; url: string | null }[];
  /** 길이 프로필·짧은 판의 원본(KAN-298) — 호출부(admin)가 검증을 끝내고 넘긴다 */
  lengthProfile: ContentLengthProfile;
  variantOfContentId: string | null;
}

/**
 * admin-api.md 4.10 재발행 — **넘어온 키만 바꾼다.** 발행 단위의 정체성(`origin` · `partner_id` ·
 * `series_*` · `license_expires_at`)은 여기 없다 — 바꾸려면 회수하고 새로 올린다.
 *
 * `undefined`(안 넘김)와 값이 다르다. `topicIds` · `sources`는 넘기면 **전체 교체**이고,
 * 넘기지 않으면 손대지 않는다.
 */
export interface RepublishContentCommand {
  title?: string;
  description?: string;
  sourceName?: string;
  audioPath?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  topicIds?: string[];
  /** 배열 순서가 곧 `position`이다 (domain.md 5.5) */
  sources?: { title: string; author: string | null; url: string | null }[];
}

/** 관리자 콘텐츠 목록 조회 조건 (admin.md 5장) */
export interface AdminContentPageQuery {
  status?: ContentStatus;
  /** 시장 필터 — 없으면 전 시장(운영자는 두 시장을 다 본다) */
  market?: UserMarket;
  offset: number;
  limit: number;
}

/** 검색 질의 로그 요약의 질의 한 줄 (admin-api.md 4.21) */
export interface SearchQueryRank {
  query: string;
  /** 타이핑 묶음 수 — 행 수다(domain.md 5.7) */
  searches: number;
  /** 그중 0건으로 끝난 수 */
  misses: number;
  /** 그중 결과에 반응한 수 — 10분 안에 결과 중 하나를 재생·담기 */
  clicked: number;
  /** 가장 최근 검색이 첫 페이지에 돌려준 콘텐츠 수(0 ~ 페이지 크기). 총 건수가 아니다(domain.md 5.7) */
  lastResultCount: number;
  /** 가장 최근 검색에서 첫 페이지 뒤에 더 있었는가 — true면 화면은 "N건 이상"으로 읽는다 */
  lastHasNext: boolean;
  /** 가장 최근 검색이 실제로 쓴 질의(교정어 또는 원문, KAN-238). 옛 행이면 `null` */
  lastQueryUsed: string | null;
  /** 가장 최근 검색의 첫 페이지 중 키워드로 맞은 건수. 옛 행이면 `null` */
  lastKeywordCount: number | null;
  lastSearchedAt: Date;
}

/** 검색 질의 로그 요약의 하루 — KST 달력일 */
export interface SearchQueryDailyCount {
  date: string;
  searches: number;
  misses: number;
  clicked: number;
  /** 키워드 0건인데 결과가 있던 검색 — 의미 엔진이 살렸다(2026-10-27) */
  rescued: number;
}

/**
 * 의미 검색만으로 결과가 나온 질의 한 줄(2026-10-27) — 키워드 0건(`keyword_count = 0`)인데 결과가 있던 검색을 실제 질의
 * (`query_used`)로 묶는다. 이 행들의 결과는 **전부 의미 엔진 몫**이라 "무엇을 찾아 줬는지"를 그대로 보여 줄 수 있다
 */
export interface SearchSemanticRank {
  query: string;
  searches: number;
  clicked: number;
  /** 가장 최근 검색의 첫 페이지 앞 몇 편 — 제목과 그 콘텐츠의 주제들 */
  contents: { contentId: string; title: string; topics: string[] }[];
  lastSearchedAt: Date;
}

/** 오타 교정 한 줄(KAN-238) — 입력 → 교정어, 교정 직후 원문 재검색(거절) 수 */
export interface SearchCorrectionRank {
  query: string;
  queryUsed: string;
  searches: number;
  rejected: number;
  clicked: number;
  lastSearchedAt: Date;
}

/** `GET /admin/search-query-logs/summary` (admin-api.md 4.21) */
export interface SearchQueryLogSummary {
  /** 집계 창의 시작 — 이 시각 이후 행만 셌다 */
  since: Date;
  totals: {
    searches: number;
    misses: number;
    /** 결과에 반응한 검색 수 */
    clicked: number;
    users: number;
    /** 2자 질의 — 트라이그램 인덱스를 못 타는 길이(explore.md 4.5-5) */
    shortQueries: number;
    /** 주제 필터가 걸린 검색 */
    filteredSearches: number;
    /** 교정된 검색(`query_used <> query` — KAN-238) */
    corrected: number;
    /** 교정 직후 10분 안 같은 입력의 원문 재검색(`exact=true`) */
    correctionRejected: number;
    /** 키워드 엔진 0건(`keyword_count = 0`) */
    keywordMisses: number;
    /** 키워드 0건인데 결과가 있던 검색 — 의미 엔진이 살렸다 */
    rescued: number;
    /** 의미 엔진 없이 응답한 검색(`engines`에 `semantic` 없음, 태그 전용 제외) */
    semanticUnavailable: number;
    /** 하이브리드 기록이 있는 검색(`keyword_count` 있음 — 2026-10-22 뒤) — 위 셋의 비율 분모 */
    hybridSearches: number;
    /** 그중 결과 없음 — `keywordMisses`와 같은 분모로 비교하는 실제 결과 없음 */
    hybridMisses: number;
  };
  daily: SearchQueryDailyCount[];
  /** 0건이 한 번이라도 있던 질의, 0건 수 내림차순 */
  missed: SearchQueryRank[];
  /** 의미 검색만으로 결과가 나온 질의, 검색 수 내림차순 */
  semantic: SearchSemanticRank[];
  /** 교정된 입력, 검색 수 내림차순 */
  corrections: SearchCorrectionRank[];
  /** 검색 수 내림차순 */
  top: SearchQueryRank[];
}

/**
 * 음질별 오디오 한 벌의 입력(domain.md 5.8 — KAN-141). 메타는 admin 쪽 `audio-probe`가 파일에서 읽은 값이다.
 * `byteSize`는 bigint 컬럼이라 문자열이다.
 */
export interface AudioRenditionInput {
  quality: AudioQuality;
  path: string;
  codec: string;
  bitrateKbps: number | null;
  channels: number | null;
  sampleRateHz: number | null;
  byteSize: string | null;
  durationSec: number;
}

/**
 * 편이 속한 시리즈의 표시값(KAN-134 확정 설계 3번) — 카드·라이브러리 항목·플레이어·상세 응답의 `series` 객체 재료.
 * 단일 콘텐츠는 이 값이 없다(응답에서 `null`). 총 편수는 `series.total_episodes`가 기준이다(`contents.total_episodes`가 아니다)
 */
export interface ContentSeriesRef {
  id: string;
  title: string;
  episodeNo: number;
  totalEpisodes: number;
}

/** 시리즈 생성(`POST /admin/series`) 입력 */
export interface CreateSeriesCommand {
  title: string;
  description: string;
  totalEpisodes: number;
  status: SeriesStatus;
  /** 발행 이름(예: "키워드") — 없으면 null */
  publisherName: string | null;
  /** 길이 프로필(KAN-298) — 없으면 standard */
  lengthProfile: ContentLengthProfile;
  /** 짧은 시리즈의 원본 시리즈 — short면 필수, standard면 null */
  variantOfSeriesId: string | null;
}

/** 시리즈 수정(`PATCH /admin/series/:id`) — `undefined`는 "안 바꾼다" */
export interface UpdateSeriesCommand {
  title?: string;
  description?: string;
  totalEpisodes?: number;
  status?: SeriesStatus;
  /** `null`은 "지운다" — 발행 이름은 비울 수 있는 칸이다 */
  publisherName?: string | null;
}

/** 시리즈 하나의 편 현황 — 상태별 편 수와 발행 중인 가장 큰 편 번호(관리자 목록) */
export interface SeriesEpisodeCounts {
  published: number;
  withdrawn: number;
  expired: number;
  /** 발행 중(`published`)인 편이 없으면 null */
  maxPublishedEpisodeNo: number | null;
}

/**
 * 드립 다음 편 판정(KAN-134, 규칙 ②′)의 편 하나 — 노출 중인 편과 그 편에 대한 사용자 상태.
 * `received`: 라이브러리에 한 번이라도 들어온 적이 있다(소프트 삭제분 포함) · `held`: 지금 라이브러리에 있고(삭제 안 됨) 완청 전 ·
 * `excluded`: 드립 영구 제외(`drip_excluded_contents`)
 */
export interface SeriesEpisodeState {
  contentId: string;
  episodeNo: number;
  received: boolean;
  held: boolean;
  excluded: boolean;
}

/** 업로드할 편의 시리즈 필드 — 업로드 검증(`SeriesService.assertEpisodeUploadable`) 입력 */
export interface SeriesEpisodeUpload {
  seriesId: string;
  episodeNo: number;
  totalEpisodes: number;
  market: UserMarket;
  /** 편의 길이 프로필(KAN-298). null = 보내지 않음 — 시리즈의 값을 따른다. 값이 있으면 시리즈와 같아야 한다 */
  lengthProfile: ContentLengthProfile | null;
}
