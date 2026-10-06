/**
 * 스토어 리뷰 폴링 주기 — 15분(KAN-133). env로 빼지 않고 상수로 둔다.
 *
 * 두 스토어의 한도(App Store Connect 3,500회/시간 · Play Developer API GET 200회/시간)에 비해 시간당 4회는
 * 여유가 크고, 리뷰는 분 단위로 반응할 일이 아니다. 주기를 바꾸고 싶으면 코드를 고친다 — 운영 중 조정할 값이 아니다.
 */
export const STORE_REVIEW_POLL_INTERVAL_MS = 15 * 60 * 1000;

/**
 * 스토어를 **처음 기록할 때** 새 리뷰로 볼 범위(domain.md 10.4). 그 스토어의 행이 하나도 없으면 가져온 리뷰 중
 * 이 시간 안에 작성·수정된 것만 알리고, 더 오래된 것은 기준선으로 적기만 한다 — 쌓여 있던 리뷰를 채널에 쏟지
 * 않으면서, 리뷰가 0건이던 스토어의 첫 리뷰는 놓치지 않는다. 폴링(15분)이 이만큼 멈추지 않는 한 새 리뷰는 안에 든다
 */
export const STORE_REVIEW_BASELINE_FRESH_MS = 24 * 60 * 60 * 1000;

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

/**
 * 앱 삭제 알림(GA4 `app_remove` — `features/backend-monitoring.md` 3-4) 폴링 주기 — 15분(스토어 리뷰와 같다).
 * GA4 실시간 보고는 최근 30분만 보이므로 주기는 그보다 짧아야 한다 — 15분이면 한 주기를 통째로 놓쳐도
 * 다음 주기 창 안에 든다. 삭제는 분 단위로 반응할 일이 아니다(2026-10-06 — 5분에서 늦췄다).
 */
export const APP_REMOVE_POLL_INTERVAL_MS = 15 * 60 * 1000;

/** 실시간 보고가 돌려주는 가장 오래된 분 — 표준 속성은 29 */
export const GA4_REALTIME_MAX_MINUTES_AGO = 29;

/**
 * 막 도착한 분은 아직 채워지는 중일 수 있어 이만큼 지난 분만 집계한다. 다음 주기가 그 분을 다시 본다 —
 * 같은 분을 두 번 세지 않는 건 "마지막으로 집계한 분" 기록이 맡는다(`app-remove-alert.service.ts`)
 */
export const GA4_REALTIME_SETTLE_MINUTES = 3;

/** 운영 스트림 접두 — 일일 보고(`admin/ga4.service.ts`)와 같은 규칙. 개발계 앱의 삭제는 세지 않는다 */
export const GA4_PROD_STREAM_PREFIX = 'ear prod';

/** 우리가 심지 않은 Firebase 자동 수집 이벤트 — Android 에서 앱이 삭제되면 Play 서비스가 올린다. iOS 는 없다 */
export const APP_REMOVE_EVENT_NAME = 'app_remove';
