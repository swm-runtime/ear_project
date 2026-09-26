import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

/**
 * Sentry 로 나가기 직전의 두 판정(KAN-92) — SDK 와 무관한 순수 함수라 여기 둔다.
 *
 * 1. **보낼 것인가** — 크래시와 예상 못한 예외뿐이다. 지하철에서 앱을 켠 사람의 네트워크 실패까지
 *    다 보내면 알림이 무의미해지고 진짜 크래시가 묻힌다.
 * 2. **무엇을 지울 것인가** — 백엔드 `sentry-scrub.ts` 와 같은 기준. `sendDefaultPii: false` 는
 *    IP·쿠키만 막으므로 사용자·URL 쿼리·요청 정보는 여기서 한 번 더 턴다.
 */

/** 연결 문제 — 버그가 아니다 */
const CONNECTIVITY_CODES: ReadonlySet<string> = new Set([
  ERROR_CODES.NETWORK_ERROR,
  ERROR_CODES.TIMEOUT,
]);

/**
 * 계약된 오류인가. `ApiError` 는 서버가 규칙대로 내려준 응답을 정규화한 것이라 4xx 는 전부
 * "예상된 결과"다(재생 한도 초과·인증 만료·검증 실패…). 5xx 와 상태를 모르는 것만 버그 후보다.
 */
export const isExpectedError = (error: unknown): boolean => {
  if (!isApiError(error)) return false;
  if (CONNECTIVITY_CODES.has(error.errorCode)) return true;
  const status = error.httpStatus;
  return status !== null && status >= 400 && status < 500;
};

/** Sentry 이벤트 중 우리가 손대는 부분만 — SDK 타입에 묶이지 않게 최소 형태로 둔다 */
export interface ScrubbableEvent {
  user?: { id?: string | number; [key: string]: unknown };
  breadcrumbs?: { data?: Record<string, unknown> }[];
  request?: unknown;
}

/** 사용자는 id 만, breadcrumb URL 은 쿼리를 떼고, 요청 정보는 통째로 지운다 */
export const scrubEvent = <T extends ScrubbableEvent>(event: T): T => {
  if (event.user) {
    event.user = event.user.id !== undefined ? { id: String(event.user.id) } : {};
  }
  for (const crumb of event.breadcrumbs ?? []) {
    const url = crumb.data?.url;
    if (typeof url === 'string' && crumb.data) {
      crumb.data.url = url.split('?')[0];
    }
  }
  delete event.request;
  return event;
};
