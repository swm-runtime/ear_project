import { StatsPeriodType } from '@/modules/content/content.enum';

import { ExploreSectionKey } from './explore.enum';

/**
 * explore-api.md 4.1 — 섹션 하나에 담는 행 수. **개수는 서버가 정한다**(권장 6~10건).
 * 섹션 안에서 더 보려는 사용자는 주제 칩으로 단일 목록(4.2)에 들어간다.
 */
export const EXPLORE_SECTION_ITEM_COUNT = 10;

/**
 * 관심사 섹션을 다시 정렬하기 전에 읽어 오는 후보 수.
 *
 * 인기·신선도 순 상위 이만큼을 읽어 **선호도 캐시의 개인 적합도로 재정렬한다**
 * (`DripScoringService.rankByPersonalFit` — 주제·저자·키워드·형식·길이·취향 임베딩). 전체를
 * 정렬하지 않는 이유는 점수가 사용자별 파생 캐시(`user_preference_vectors` — domain.md 7.2)와
 * 후보 임베딩의 함수라 SQL 한 문장으로 표현할 수 없기 때문이다.
 *
 * **한계**: 인기·신선도 상위 밖에 있는 콘텐츠는 취향이 아무리 맞아도 올라오지 못한다.
 * 초기 콘텐츠 풀에서는 이 값이 풀 전체를 덮으므로 실질 영향이 없고(PRD 8.1),
 * 풀이 커지면 후보 선정 자체를 편성 배치의 스코어링과 합쳐야 한다.
 */
export const EXPLORE_RANKING_POOL_SIZE = 60;

/** explore-api.md 4.2 — 상한은 서버가 강제한다(architecture.md 9.3) */
export const DEFAULT_EXPLORE_PAGE_SIZE = 20;
export const MAX_EXPLORE_PAGE_SIZE = 50;

/**
 * `explore.md` 4.1-1 — 인기 콘텐츠의 기본 집계 구간.
 *
 * **주간이 아니라 월간이다.** 주간은 초기에 표본이 너무 적고, 온보딩 추천이 이미 직전 확정
 * 월을 쓰고 있어 두 화면의 "인기"가 같은 구간을 보게 된다.
 *
 * **기본값을 클라이언트가 갖지 않는다**(explore-api.md 4.2-1). `period` 미전송이면 서버가 이
 * 값으로 해석하고 응답에 되돌려 준다 — 기본 구간이 바뀔 때 앱 배포를 기다리지 않아야 한다.
 */
export const DEFAULT_POPULAR_PERIOD = StatsPeriodType.MONTH;

/**
 * 검색 질의 길이(explore-api.md 4.5) — **트림 후 2자 이상**이 계약이고, 상한은 서버가
 * 정한다(convention.md 3.3 — 상한 없는 문자열을 받지 않는다).
 *
 * **최소 길이를 올리는 방식으로 성능을 풀지 않는다**(`explore.md` 4.5-5) — 한국어는
 * "이직"·"면접" 같은 2자 검색어가 흔해 최소 길이를 올리면 검색 자체가 죽는다.
 */
export const MIN_SEARCH_QUERY_LENGTH = 2;
export const MAX_SEARCH_QUERY_LENGTH = 100;

/**
 * 빈 결과 fallback의 구성(explore-api.md 4.5 — `explore.md` 4.5-3).
 * 인기 목록은 섹션 행 수와 같은 분량을, 관련 주제는 칩 몇 개만 내려준다 — 개수는 서버 소유다.
 */
export const SEARCH_FALLBACK_RELATED_TOPIC_COUNT = 3;
export const SEARCH_FALLBACK_POPULAR_COUNT = EXPLORE_SECTION_ITEM_COUNT;

/**
 * 한 번에 보낼 수 있는 주제 필터 수의 상한.
 * 화면에서 고를 수 있는 주제는 전체 주제라 상한이 없지만, 서버는 `IN` 절이 무한정 길어지지
 * 않게 막는다(라이브러리와 같은 규칙).
 */
export const MAX_EXPLORE_TOPIC_FILTER_SIZE = 50;

/**
 * 섹션 제목. **화면에 그대로 그리는 문자열이다**(`explore-uiux.md` 4.1) —
 * 클라이언트가 `key`로 조립하지 않으므로 제목 변경에 앱 배포가 필요 없다.
 *
 * `topic_group`은 주제명을 제목으로 쓰므로 여기에 없다.
 * **내부 용어("드립"·"섹션"·"피드"·"적립")를 노출하지 않는다**(`explore-uiux.md` 6장).
 */
export const EXPLORE_SECTION_TITLES: Record<
  Exclude<ExploreSectionKey, ExploreSectionKey.TOPIC_GROUP>,
  string
> = {
  [ExploreSectionKey.INTEREST]: '관심사에 맞는 추천',
  [ExploreSectionKey.NEW]: '새로 나온 콘텐츠',
  [ExploreSectionKey.POPULAR]: '인기 콘텐츠',
};
