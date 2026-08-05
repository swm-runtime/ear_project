import {
  RecommendationSectionType,
  YearsOfExperienceRange,
} from './onboarding.enum';

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

/**
 * onboarding-api.md 4.4 — 구간 enum을 `users.years_of_experience`(int)에 저장할 때 쓰는
 * **구간 하한값**이다. 1:1이라 되돌릴 수 있다.
 *
 * 컬럼 타입(int)과 화면 입력 방식(구간)이 어긋나 있어, **구간 정의가 바뀌면 환산표와
 * 저장된 값이 조용히 어긋난다.** 컬럼을 varchar enum으로 바꿀지는 미결이다(9장).
 */
export const YEARS_OF_EXPERIENCE_LOWER_BOUND: Readonly<
  Record<YearsOfExperienceRange, number>
> = {
  [YearsOfExperienceRange.ZERO_TO_ONE]: 0,
  [YearsOfExperienceRange.TWO_TO_THREE]: 2,
  [YearsOfExperienceRange.FOUR_TO_SIX]: 4,
  [YearsOfExperienceRange.SEVEN_PLUS]: 7,
};

/** 저장된 하한값을 구간으로 되돌린다. 경계 밖 값은 가장 가까운 아래 구간으로 본다 */
export function toYearsOfExperienceRange(
  value: number | null,
): YearsOfExperienceRange | null {
  if (value === null) {
    return null;
  }

  const ranges = Object.entries(YEARS_OF_EXPERIENCE_LOWER_BOUND) as [
    YearsOfExperienceRange,
    number,
  ][];

  let matched: YearsOfExperienceRange | null = null;

  for (const [range, lowerBound] of ranges) {
    if (value >= lowerBound) {
      matched = range;
    }
  }

  return matched;
}
