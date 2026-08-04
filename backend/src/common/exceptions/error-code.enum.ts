/**
 * architecture.md 7.5 — 모든 에러 코드는 이 enum 한 곳에서 관리한다.
 * 문자열 리터럴을 직접 던지지 않는다.
 *
 * 여기 있는 것은 도메인과 무관한 기반 코드뿐이다. 도메인 코드
 * (`PLAY_LIMIT_EXCEEDED`, `CONTENT_WITHDRAWN` 등)는 해당 기능을 구현할 때
 * 추가하고, `docs/pages/common-error-handling.md` 6장 표를 함께 갱신한다.
 */
export enum ErrorCode {
  /** 예상하지 못한 5xx. 내부 사유를 노출하지 않기 위해 항상 이 코드로 고정한다 */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  /** 요청 형식·검증 실패 (400) */
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  /** 인증 없음·만료 (401) */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** 권한 없음 (403) */
  FORBIDDEN = 'FORBIDDEN',
  /** 리소스 없음 (404) */
  NOT_FOUND = 'NOT_FOUND',
  /** 상태 충돌 (409) */
  CONFLICT = 'CONFLICT',
  /** 레이트 리밋 (429) */
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  /** 외부 연동 실패 — AI 서버·스토어·스토리지 */
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}
