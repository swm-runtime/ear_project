/**
 * 로그에 값이 남으면 안 되는 쿼리 파라미터(convention.md 8.4 — **마스킹 대상 키 목록은
 * 한 곳에서 관리한다**). 요청 경로를 로그에 남기는 곳(LoggingInterceptor ·
 * AllExceptionsFilter)은 전부 이 유틸을 거친다 — 한쪽만 가리면 다른 쪽이 새는 구멍이 된다.
 *
 * `signature` — 오디오 서명 URL의 서명. 쿼리를 포함한 `request.url`을 그대로 남기면
 * **서명 URL 전문이 로그에 남는 것**과 같다(8.4가 첫 항목으로 금지). TTL(수 분) 안에
 * 로그를 본 사람이 서명을 복사해 오디오에 접근할 수 있고, 그 접근은 발급 기록
 * (`audio_access_logs`)에 남지 않는 우회 경로가 된다.
 */
const REDACTED_QUERY_PARAMS = ['signature'] as const;

const REDACTED_VALUE = '[redacted]';

/**
 * 쿼리 문자열에서 민감 파라미터의 **값만** 가린다 — 키는 남겨야 "서명이 실려 왔다"는
 * 사실 자체는 추적할 수 있다.
 *
 * URL 파싱이 실패할 수 있는 입력(비정상 요청)도 로그는 남아야 하므로, 파싱 대신
 * 문자열 치환으로 처리한다 — 마스킹이 실패해서 원문이 새는 경로를 만들지 않는다.
 */
export function redactSensitiveQuery(url: string): string {
  const queryStart = url.indexOf('?');

  if (queryStart === -1) {
    return url;
  }

  let query = url.slice(queryStart + 1);

  for (const param of REDACTED_QUERY_PARAMS) {
    query = query.replace(
      new RegExp(`(^|[?&])(${param})=[^&#]*`, 'g'),
      `$1$2=${REDACTED_VALUE}`,
    );
  }

  return url.slice(0, queryStart + 1) + query;
}
