/**
 * 모든 서버 에러의 정규화 형태(architecture.md 8.1).
 * 화면·훅은 이 타입의 errorCode로만 분기한다. HTTP status 직접 비교 금지.
 */
export class ApiError extends Error {
  constructor(
    readonly errorCode: string,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSec: number | null,
    readonly traceId: string | null,
    readonly httpStatus: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;
