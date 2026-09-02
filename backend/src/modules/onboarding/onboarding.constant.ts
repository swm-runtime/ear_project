import { RecommendationSectionType } from './onboarding.enum';

/** onboarding.md 4 [3] — 관심 주제 추천 6건 + 두 번째 섹션 3건 = 총 9건 */
export const INTEREST_SECTION_SIZE = 6;
export const DISCOVERY_SECTION_SIZE = 3;
export const RECOMMENDATION_TOTAL_SIZE =
  INTEREST_SECTION_SIZE + DISCOVERY_SECTION_SIZE;

/**
 * 담기 상한. 화면에 노출된 9건 안에서만 담기가 일어나므로 추천 건수와 같다.
 * 상한이 없으면 한 요청으로 카탈로그 전체를 적립시킬 수 있다(architecture.md 9.3).
 */
export const PICK_CONTENT_LIMIT = RECOMMENDATION_TOTAL_SIZE;

/**
 * 두 번째 섹션 후보를 넉넉히 뽑아 두는 크기.
 * 인기 순위와 후보 필터를 교차시켜야 하므로 필요한 건수보다 많이 읽는다.
 */
export const DISCOVERY_CANDIDATE_POOL_SIZE = 50;

/**
 * onboarding-api.md 2장 — 첫 드립 대기 기준값.
 *
 * **클라이언트에 하드코딩하지 않고 서버가 응답으로 내려준다.** 둘 다 실측 후 조정될
 * 잠정값인데 앱에 박아두면 조정에 스토어 심사 주기가 걸린다.
 */
export const FIRST_DRIP_POLL_INTERVAL_SEC = 1;
export const FIRST_DRIP_MAX_WAIT_SEC = 15;

/** 화면에 그대로 노출할 섹션 제목 (onboarding-api.md 4.5) */
export const SECTION_TITLES: Readonly<
  Record<RecommendationSectionType, string>
> = {
  [RecommendationSectionType.INTEREST]: '관심 주제 추천',
  [RecommendationSectionType.MONTHLY_POPULAR]: '이번 달 인기',
  /** 잠정안이다. 확정되면 이 문자열만 바꾸면 되고 계약은 바뀌지 않는다 */
  [RecommendationSectionType.TOPIC_DISCOVERY]: '이런 주제는 어때요?',
};
