/**
 * 콘텐츠 후기 · 후기 참여 프로모션 API(content-review-api.md — KAN-279) — 개발 중에는 mock 으로 동작한다
 * (api/content-review.mock.ts). 개발계 실서버로 붙일 때는 `EXPO_PUBLIC_CONTENT_REVIEW_API=real`.
 * 운영 빌드(`__DEV__` 아님)는 늘 실서버다 — 서버 스위치 `CONTENT_REVIEW_ENABLED`가 꺼져 있으면 `enabled=false`라 아무것도 그리지 않는다.
 */
export const IS_CONTENT_REVIEW_API_MOCKED =
  __DEV__ && process.env.EXPO_PUBLIC_CONTENT_REVIEW_API !== 'real';

/** 글 길이 상한(content-review-api.md 4.2 — 앞뒤 공백을 뺀 뒤 500자). 화면이 입력을 막고, 판정은 서버가 다시 한다 */
export const CONTENT_REVIEW_TEXT_MAX_LENGTH = 500;

/** 별 1~5(4.2 `stars`) */
export const CONTENT_REVIEW_STAR_VALUES = [1, 2, 3, 4, 5] as const;

/** 앞의 팝업이 사라지고 한 박자 쉰다 — 추천 별점 팝업 · 가입 체험 안내와 같은 값 */
export const CONTENT_REVIEW_PROMPT_REVEAL_DELAY_MS = 400;
