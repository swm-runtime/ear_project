import type { ErrorEvent } from '@sentry/nestjs';

import { redactSensitiveQuery } from '@/common/utils/redact-url.util';

/**
 * Sentry 로 나가기 직전에 개인정보·비밀값을 지운다.
 *
 * **convention.md 8장은 토큰·인증 코드·이메일 원문·요청 바디를 로그에 남기지 않는다고 못 박는다.**
 * Sentry 는 우리 밖의 서비스라 기준이 더 엄격해야 한다 — 기본 설정대로 두면 요청 바디와
 * 헤더(Authorization·Cookie 포함)가 그대로 나간다. `sendDefaultPii: false` 만으로는
 * 모자라서(그 옵션은 IP·쿠키만 막는다) 여기서 한 번 더 턴다.
 *
 * 남기는 것: 메서드 · 경로(민감 쿼리 마스킹) · 상태 · 에러 코드 · trace_id · 스택.
 * 지우는 것: 바디 · 전 헤더 · 쿠키 · IP · 이메일 · 사용자 이름 · 바깥 호출 breadcrumb 의 경로·쿼리.
 */

/** 값 자체가 비밀이라 키 이름만 남기고 값은 통째로 지운다 */
const DROP_HEADERS = true;

/** 주소를 통째로 가릴 때 남기는 값 — `redact-url.util.ts` 와 같은 표기 */
const REDACTED_URL = '[redacted]';

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;

  if (request) {
    // 요청 바디 — 가입 폼·인증 코드·기기 토큰이 전부 여기로 들어온다
    delete request.data;
    delete request.cookies;
    if (DROP_HEADERS) {
      delete request.headers;
    }
    // 쿼리는 지우지 않고 마스킹한다 — 어느 엔드포인트였는지는 진단에 필요하다
    if (typeof request.url === 'string') {
      request.url = redactSensitiveQuery(request.url);
    }
    if (typeof request.query_string === 'string') {
      request.query_string = redactSensitiveQuery(
        `?${request.query_string}`,
      ).replace(/^\?/, '');
    }
  }

  if (event.user) {
    // 사용자 식별은 id 로만 한다. 이메일·이름·IP 는 보내지 않는다
    event.user = event.user.id ? { id: event.user.id } : {};
  }

  for (const crumb of event.breadcrumbs ?? []) {
    const data: Record<string, unknown> | undefined = crumb.data;
    if (!data) {
      continue;
    }

    if (crumb.category === 'http') {
      scrubOutgoingHttpCrumb(data);
      continue;
    }

    // 그 밖의 breadcrumb 에 실려 온 URL 도 같은 규칙으로 턴다
    if (typeof data.url === 'string') {
      data.url = redactSensitiveQuery(data.url);
    }
  }

  return event;
}

/**
 * **바깥으로 나간 HTTP 호출(`category: 'http'`) breadcrumb 은 주소를 호스트까지만 남긴다.**
 *
 * SDK 는 쿼리만 떼어 `http.query` 로 옮기고 **경로는 그대로 싣는다.** 우리가 부르는 주소 중에는 경로 자체가
 * 비밀인 것이 있다 — Slack 웹훅(`hooks.slack.com/services/…` — 그 주소를 알면 채널에 글을 쓸 수 있다),
 * Google Play 구매 조회·확인(`…/purchases/subscriptionsv2/tokens/<구매 토큰>` — convention.md 8.4).
 * 게다가 요청마다 만드는 Sentry 격리 스코프는 기본 스코프를 **복제**해 시작하므로, 스케줄러(구독 보정·일일
 * 지표·알림)가 쌓은 breadcrumb 이 이후 아무 요청의 500 이벤트에 실려 나간다(최대 100개).
 *
 * 진단에는 "어느 상대에게 무슨 메서드로 불렀고 몇이 왔나"면 충분하다 — 경로·쿼리·프래그먼트는 버린다.
 */
function scrubOutgoingHttpCrumb(data: Record<string, unknown>): void {
  if (typeof data.url === 'string') {
    data.url = originOf(data.url);
  }
  delete data['http.query'];
  delete data['http.fragment'];
}

function originOf(url: string): string {
  try {
    const { origin } = new URL(url);
    // 상대 경로·특수 스킴은 origin 이 'null' 이다 — 원문을 남기지 않는다
    return origin === 'null' ? REDACTED_URL : origin;
  } catch {
    return REDACTED_URL;
  }
}
