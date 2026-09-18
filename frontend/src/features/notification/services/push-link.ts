import { PUSH_TYPE_DRIP_ARRIVAL } from '../notification.constants';
import type { PushArrival, PushTarget } from '../notification.types';

const SCHEME = 'ear://';
const CONTENT_PREFIX = 'contents/';

/**
 * 푸시 `data.deep_link` 해석(notification.md 3장) — `ear://library` · `ear://contents/{content_id}`.
 * 모르는 형식은 `null`이다. 서버가 새 목적지를 먼저 보내기 시작해도 옛 앱이 엉뚱한 화면을
 * 열지 않는다 — 호출부가 라이브러리로 폴백한다.
 */
export const parsePushDeepLink = (deepLink: unknown): PushTarget | null => {
  if (typeof deepLink !== 'string' || !deepLink.startsWith(SCHEME)) return null;
  const path = deepLink.slice(SCHEME.length).split(/[?#]/)[0].replace(/\/+$/, '');
  if (path === 'library') return { kind: 'library' };
  if (path.startsWith(CONTENT_PREFIX)) {
    const contentId = path.slice(CONTENT_PREFIX.length);
    if (contentId.length > 0 && !contentId.includes('/')) return { kind: 'content', contentId };
  }
  return null;
};

/**
 * 푸시 `data` → 도착 통지. **우리 알림이 아니면 `null`** — 다른 종류가 생기기 전까지
 * `drip_arrival`만 다룬다. 목적지를 못 읽으면 라이브러리다(도착한 것은 어쨌든 거기 있다).
 */
export const parsePushData = (data: unknown): PushArrival | null => {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.type !== PUSH_TYPE_DRIP_ARRIVAL) return null;
  // Expo Push는 data를 JSON으로 실어 오지만 경로에 따라 숫자가 문자열로 올 수 있다
  const count = Number(record.content_count);
  return {
    target: parsePushDeepLink(record.deep_link) ?? { kind: 'library' },
    contentCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : null,
  };
};
