/**
 * onboarding-api.md 4.5 — 3단계 추천 섹션의 종류.
 *
 * **두 번째 섹션의 모드를 `section_type`으로 알린다.** 표본 부족일 때는 제목이 바뀌는데,
 * 클라이언트가 `title` 문자열로 모드를 판정하면 문구를 조정하는 순간 분기가 깨진다.
 */
export enum RecommendationSectionType {
  /** 1단계에서 고른 주제의 콘텐츠 6건 */
  INTEREST = 'interest',
  /** 직전 확정 월의 인기 상위 3건 — 관심 주제 밖에서만 뽑는다 */
  MONTHLY_POPULAR = 'monthly_popular',
  /** 월간 표본이 부족할 때 같은 자리에 놓는 랜덤 3건 */
  TOPIC_DISCOVERY = 'topic_discovery',
}

/** onboarding-api.md 4.4 — 정수 연차가 아니라 **구간값**으로 주고받는다 */
export enum YearsOfExperienceRange {
  ZERO_TO_ONE = '0-1',
  TWO_TO_THREE = '2-3',
  FOUR_TO_SIX = '4-6',
  SEVEN_PLUS = '7+',
}
