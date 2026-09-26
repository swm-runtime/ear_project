/** Expo Push API — https://docs.expo.dev/push-notifications/sending-notifications/ */
export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL =
  'https://exp.host/--/api/v2/push/getReceipts';

/** Expo가 한 요청에 받는 메시지 상한 */
export const EXPO_PUSH_SEND_CHUNK_SIZE = 100;
/** Expo가 한 요청에 받는 receipt id 상한 */
export const EXPO_PUSH_RECEIPT_CHUNK_SIZE = 1000;
/**
 * 429·5xx 재시도 대기(Expo 권고 — 지수 백오프). 두 번까지만 다시 보낸다.
 * **타임아웃은 재시도하지 않는다** — Expo가 이미 접수했을 수 있어 다시 보내면 같은 알림이 두 번 간다.
 */
export const EXPO_PUSH_RETRY_DELAYS_MS = [1_000, 3_000];

/** 응답이 없으면 끊는다 — 상한 없는 fetch는 편성 배치 전체를 붙잡는다 */
export const EXPO_PUSH_TIMEOUT_MS = 10_000;

/**
 * **연결이 성립하기 전에** 난 네트워크 오류 — 요청이 아직 나가지 않았으므로 다시 보내도 같은 알림이
 * 두 번 가지 않는다. 그래서 429·5xx와 같은 대기로 재시도한다(2026-09-26 감사 — 05:00 순간의 DNS·연결
 * 거부 하나로 100명 청크가 통째로 `failed`가 되고 그날 재발송 경로가 없었다).
 * 타임아웃(`TimeoutError`)·`ECONNRESET`처럼 **보낸 뒤** 끊긴 오류는 여기 없다 — Expo가 접수했을 수 있다.
 * 코드는 undici `fetch`가 `TypeError('fetch failed')`의 `cause.code`에 싣는 값이다.
 */
export const EXPO_PUSH_RETRYABLE_NETWORK_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * 드립 도착 알림의 보관 시한(Expo `ttl`, 초) — **다음 05:00 KST 편성 배치까지**(결정 2026-09-26,
 * `notification.md` 4.3). "오늘의 콘텐츠"는 당일성 문구라, 며칠 꺼져 있던 기기에 날짜별 알림이 한꺼번에
 * 쌓이면 하루 1건 규칙이 화면에서 무너진다. 다음 배치가 새 알림을 보내므로 그 뒤의 전달은 의미가 없다.
 * 하한은 배치 소요 시간 안에 만료되지 않게 둔다.
 */
export const DRIP_ARRIVAL_PUSH_TTL_MIN_SEC = 60 * 60;
export const DRIP_BATCH_HOUR_KST = 5;

/** Expo 문서의 권고 — receipt는 발송 후 약 15분 뒤에 조회한다 */
export const PUSH_RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;
/** Expo는 receipt를 24시간만 보관한다 — 그 뒤로는 물어봐도 없다 */
export const PUSH_RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** 조회 대기 목록의 메모리 상한 — 넘치면 오래된 것부터 버린다(다음 발송의 ticket 오류가 다시 잡는다) */
export const PUSH_RECEIPT_MAX_PENDING = 50_000;

/** 발송 서비스가 "이 기기에 더는 닿지 않는다"고 알려주는 오류 — 토큰을 무효화한다(`notification.md` 7) */
export const EXPO_DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

/** `ExponentPushToken[...]` / `ExpoPushToken[...]` — 그 밖의 값(개발 스텁 등)은 보내지 않는다 */
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[.+\]$/;

/**
 * 알림 탭의 이동 대상(`notification.md` 3 `deep_link`). 앱 스킴(`app.json` `scheme: ear`)을 쓴다 —
 * 라이브러리는 웹 주소가 없고, 콘텐츠도 앱 안 이동이라 공유 링크(유니버설 링크)를 거칠 이유가 없다.
 */
export const DEEP_LINK_LIBRARY = 'ear://library';
export const buildContentDeepLink = (contentId: string): string =>
  `ear://contents/${contentId}`;

/** `notification.md` 4.3 문구 */
export const buildDripArrivalTitle = (count: number): string =>
  `오늘의 콘텐츠 ${count}편이 도착했어요`;
