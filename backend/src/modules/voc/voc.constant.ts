/**
 * 스토어 리뷰 폴링 주기 — 15분(KAN-133). env로 빼지 않고 상수로 둔다.
 *
 * 두 스토어의 한도(App Store Connect 3,500회/시간 · Play Developer API GET 200회/시간)에 비해 시간당 4회는
 * 여유가 크고, 리뷰는 분 단위로 반응할 일이 아니다. 주기를 바꾸고 싶으면 코드를 고친다 — 운영 중 조정할 값이 아니다.
 */
export const STORE_REVIEW_POLL_INTERVAL_MS = 15 * 60 * 1000;

/** App Store Connect `customerReviews` 한 번에 받는 건수 — 날짜 필터가 없어 최신순 정렬 뒤 이만큼만 본다 */
export const APP_STORE_REVIEW_PAGE_SIZE = 50;

/** Play `reviews.list` 한 번에 받는 건수 상한(API 최대 100). 최근 1주일치만 돌아오므로 페이지를 넘기지 않는다 */
export const PLAY_REVIEW_PAGE_SIZE = 100;

/**
 * App Store Connect API JWT 유효 시간 — Apple 상한은 20분이다. 요청마다 새로 만들므로 넉넉할 필요가 없고,
 * 서버 시계가 조금 앞서 있어도 상한을 넘기지 않게 10분으로 둔다.
 */
export const APP_STORE_CONNECT_TOKEN_TTL_SEC = 10 * 60;

/** Slack 메시지에 싣는 리뷰 본문 상한(자) — 긴 리뷰는 채널에서 접히지 않고 스토어 콘솔에서 본다 */
export const REVIEW_BODY_MAX_LENGTH = 500;

/** 스토어 API 응답 대기 상한 — 스케줄러에서 돌지만 한 주기(15분)를 잡아먹게 두지 않는다 */
export const STORE_API_TIMEOUT_MS = 15_000;
