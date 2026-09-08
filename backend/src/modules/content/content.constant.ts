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

/**
 * domain.md 5.6 — 현재 임베딩 모델 식별자 (확정 2026-09-01, 15.1 #11 해소).
 *
 * 스코어링은 이 모델의 벡터만 읽는다 — "서로 다른 모델의 벡터는 비교 불가하므로 `model`이
 * 섞인 상태로 스코어링하지 않는다"(5.6)를 조회 조건으로 보장한다. 모델을 교체하면 이 값을
 * 함께 바꾸고, 전량 재생성이 끝날 때까지 구 모델 행은 자연히 축 제외(중립 처리)가 된다.
 * 개발 스텁이 만드는 `"dev-stub"` 벡터도 같은 조건으로 걸러진다.
 */
export const EMBEDDING_MODEL_ID = 'text-embedding-3-small';

/** domain.md 5.6 — `vector(1536)` 확정 차원. 업로드 검증과 스키마가 같은 값을 봐야 한다 */
export const EMBEDDING_DIM = 1536;

/**
 * 회수 동기화(`GET /contents/withdrawn`) 한 응답의 상한.
 *
 * **`since`가 클라이언트 값이라 상한이 없으면 전 구간 스캔이 된다** — `1970-01-01`을 보내면
 * 회수된 콘텐츠 전부가 페이징 없이 내려온다(`architecture.md` 9.3 — 목록 조회는 서버가
 * `limit`을 강제한다). 잘렸다는 사실은 응답이 알려주고, 클라이언트는 마지막 회수 시각을
 * 다음 `since`로 써서 이어 받는다.
 */
export const WITHDRAWN_SYNC_MAX_LIMIT = 200;
