/**
 * onboarding.md 4 [3] / domain.md 5.4 — 직전 확정 월의 재생 합계가 이 값 미만이면
 * **표본 부족**으로 본다. 표본이 적을 때의 상위 3건은 실력이 아니라 우연이라,
 * 순위처럼 보여주면 추천 신뢰도만 잃는다.
 *
 * 잠정 기준값이며 **콘텐츠 풀 규모가 정해지면 첫 달 실데이터로 조정한다**
 * (onboarding.md 미결 사항).
 */
export const MONTHLY_POPULAR_SAMPLE_THRESHOLD = 30;

/**
 * 검색 랭킹의 매칭 필드 가중치 (`explore.md` 4.5-5 — 확정 2026-08-23).
 *
 * 우선순위(제목 > 저자 > 주제명 > 설명)는 문서가 확정했고 **계수 값은 서버 구현이
 * 소유한다** — 그래서 계약이 아니라 여기에 있다. 2의 거듭제곱으로 두는 이유는
 * **상위 필드 단독 매칭(8)이 하위 필드 전부의 조합(4+2+1=7)보다 항상 크게** 만들어,
 * 가중 합산이 문서의 우선순위를 정확히 재현하게 하기 위해서다.
 */
export const SEARCH_WEIGHT_TITLE = 8;
export const SEARCH_WEIGHT_AUTHOR = 4;
export const SEARCH_WEIGHT_TOPIC = 2;
export const SEARCH_WEIGHT_DESCRIPTION = 1;
