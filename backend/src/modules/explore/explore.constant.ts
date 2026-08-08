import { StatsPeriodType } from '@/modules/content/content.enum';
import { UserSignalAction } from '@/modules/playback/playback.enum';

import { ExploreSectionKey } from './explore.enum';

/**
 * explore-api.md 4.1 — 섹션 하나에 담는 행 수. **개수는 서버가 정한다**(권장 6~10건).
 * 섹션 안에서 더 보려는 사용자는 주제 칩으로 단일 목록(4.2)에 들어간다.
 */
export const EXPLORE_SECTION_ITEM_COUNT = 10;

/**
 * 관심사 섹션을 다시 정렬하기 전에 읽어 오는 후보 수.
 *
 * 인기·신선도 순 상위 이만큼을 읽어 **소비 신호로 재정렬한다.** 전체를 정렬하지 않는 이유는
 * 점수가 콘텐츠×주제 조인이라 SQL 한 문장으로 표현하려면 가중치 테이블이 필요하고, 그것은
 * 편성 배치가 채우기로 한 파생 캐시(`user_preference_vectors` — domain.md 7.2)의 자리다.
 *
 * **한계**: 인기·신선도 상위 밖에 있는 콘텐츠는 신호 점수가 높아도 올라오지 못한다.
 * 초기 콘텐츠 풀에서는 이 값이 풀 전체를 덮으므로 실질 영향이 없고(PRD 8.1),
 * 풀이 커지면 편성 배치의 선호 벡터로 옮겨야 한다.
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
 * 한 번에 보낼 수 있는 주제 필터 수의 상한.
 * 화면에서 고를 수 있는 주제는 전체 주제라 상한이 없지만, 서버는 `IN` 절이 무한정 길어지지
 * 않게 막는다(라이브러리와 같은 규칙).
 */
export const MAX_EXPLORE_TOPIC_FILTER_SIZE = 50;

/**
 * 추천 랭킹이 읽는 신호의 기간·건수 상한.
 *
 * `user_signals`는 사용자당 계속 쌓이는 이력 테이블이라(domain.md 6.4) 전량을 읽으면 조회
 * 비용이 사용자 나이에 비례한다. 랭킹이 보려는 것은 **최근 취향**이므로 창을 자른다.
 */
export const SIGNAL_RECENCY_WINDOW_DAYS = 30;
export const MAX_RECENT_SIGNAL_COUNT = 200;

/**
 * `drip-scheduling.md` 4.4 — 콜드스타트 판정 기준은 **완청 3건**이다(FR-17).
 * 미만이면 신호 기반 항목을 사실상 0으로 두고 인기·신선도 비중을 높인다.
 */
export const COLD_START_COMPLETE_SIGNAL_COUNT = 3;

/**
 * `drip-scheduling.md` 4.3 신호 해석 표를 그대로 옮긴 값이다.
 *
 * **`play`에는 가중치를 두지 않는다.** 해석 표가 다루는 것은 "play 후 skip"이지 재생 시작
 * 자체가 아니다 — 튼 것만으로는 긍정도 부정도 아니다.
 */
export const SIGNAL_TOPIC_WEIGHTS: Partial<Record<UserSignalAction, number>> = {
  /** 강한 긍정 */
  [UserSignalAction.COMPLETE]: 3,
  /** 강한 긍정 */
  [UserSignalAction.REPLAY]: 3,
  /** 긍정 — 완청보다 약하게 */
  [UserSignalAction.SAVE]: 2,
  /** 부정 */
  [UserSignalAction.SKIP]: -2,
  /** 부정 — 소폭 감점 */
  [UserSignalAction.UNSAVE]: -1,
  [UserSignalAction.DELETE]: -1,
};

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
