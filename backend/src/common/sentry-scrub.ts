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
 * 지우는 것: 바디 · 전 헤더 · 쿠키 · IP · 이메일 · 사용자 이름.
 */

/** 값 자체가 비밀이라 키 이름만 남기고 값은 통째로 지운다 */
const DROP_HEADERS = true;

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

  // breadcrumb 에 실려 온 URL 도 같은 규칙으로 턴다
  for (const crumb of event.breadcrumbs ?? []) {
    const data: Record<string, unknown> | undefined = crumb.data;
    const url = data?.url;
    if (typeof url === 'string') {
      data.url = redactSensitiveQuery(url);
    }
  }

  return event;
}
