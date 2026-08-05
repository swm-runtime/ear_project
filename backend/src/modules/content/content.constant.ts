/**
 * onboarding.md 4 [3] / domain.md 5.4 — 직전 확정 월의 재생 합계가 이 값 미만이면
 * **표본 부족**으로 본다. 표본이 적을 때의 상위 3건은 실력이 아니라 우연이라,
 * 순위처럼 보여주면 추천 신뢰도만 잃는다.
 *
 * 잠정 기준값이며 **콘텐츠 풀 규모가 정해지면 첫 달 실데이터로 조정한다**
 * (onboarding.md 미결 사항).
 */
export const MONTHLY_POPULAR_SAMPLE_THRESHOLD = 30;
