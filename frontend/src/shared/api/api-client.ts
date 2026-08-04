import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { logger } from '@/shared/lib/logger';

import { ApiError } from './api-error';
import { ERROR_CODES } from './error-codes';

/** common-error-handling.md — 일반 요청 타임아웃 10초 */
const REQUEST_TIMEOUT_MS = 10_000;
/** common-error-handling.md — 5xx·429 자동 재시도 최대 2회, 1초→3초 */
const AUTO_RETRY_MAX_COUNT = 2;
const AUTO_RETRY_DELAYS_MS = [1_000, 3_000] as const;
/** common-error-handling.md — 백오프 지터 ±20% */
const AUTO_RETRY_JITTER_RATIO = 0.2;

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

/**
 * shared는 도메인을 모른다 — 토큰 동작은 이 인터페이스로만 접근하고,
 * 구현(auth의 SessionService)은 app/bootstrap에서 주입된다(architecture.md 4.3).
 */
export interface TokenProvider {
  getAccessToken(): Promise<string | null>;
  /** 갱신 성공 여부를 반환한다. 단일 인플라이트 보장은 구현체 책임이다. */
  refreshTokens(): Promise<boolean>;
  /** 갱신 실패 시 호출 — 로컬 세션 정리 후 시작 화면 이동은 구현체 몫이다. */
  onSessionExpired(): void;
}

/** 요청별 옵션 — api 모듈이 요청 정의 시 선언한다(convention.md 5.2). */
declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 부작용 있는 POST의 멱등키(auth-api.md ★). api 함수가 발급해 재시도 간 재사용한다. */
    idempotencyKey?: string;
    /** 로그인·토큰 갱신 등 401 갱신 플로우를 타면 안 되는 요청 */
    skipAuthRefresh?: boolean;
    /** 결제·영수증 검증·탈퇴 등 자동 재시도 금지 요청(architecture.md 8.2) */
    noAutoRetry?: boolean;
    retryCount?: number;
    isAuthRetry?: boolean;
  }
}

interface ErrorResponseBody {
  error_code?: string;
  message?: string;
  retryable?: boolean;
  retry_after_sec?: number | null;
  trace_id?: string;
}

let tokenProvider: TokenProvider | null = null;

export const registerTokenProvider = (provider: TokenProvider): void => {
  tokenProvider = provider;
};

const toApiError = (error: AxiosError<ErrorResponseBody>): ApiError => {
  if (error.response) {
    const body = error.response.data;
    return new ApiError(
      body?.error_code ?? ERROR_CODES.UNKNOWN,
      body?.message ?? '요청을 처리하지 못했어요. 다시 시도해주세요',
      body?.retryable ?? false,
      body?.retry_after_sec ?? null,
      body?.trace_id ?? null,
      error.response.status,
    );
  }
  if (error.code === 'ECONNABORTED') {
    return new ApiError(
      ERROR_CODES.TIMEOUT,
      '요청 시간이 초과됐어요. 다시 시도해주세요',
      true,
      null,
      null,
      null,
    );
  }
  return new ApiError(
    ERROR_CODES.NETWORK_ERROR,
    '네트워크 연결을 확인해주세요',
    true,
    null,
    null,
    null,
  );
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const withJitter = (ms: number): number => {
  const jitter = ms * AUTO_RETRY_JITTER_RATIO;
  return ms + (Math.random() * 2 - 1) * jitter;
};

const canAutoRetry = (config: InternalAxiosRequestConfig, apiError: ApiError): boolean => {
  if (config.noAutoRetry) return false;
  if ((config.retryCount ?? 0) >= AUTO_RETRY_MAX_COUNT) return false;

  const isRetryableStatus =
    apiError.httpStatus === null || apiError.httpStatus >= 500 || apiError.httpStatus === 429;
  if (!isRetryableStatus) return false;

  // GET은 기본 대상, 변경 요청은 멱등키가 있을 때만(architecture.md 8.2)
  const method = (config.method ?? 'get').toLowerCase();
  return method === 'get' || config.idempotencyKey !== undefined;
};

// eslint-disable-next-line import/no-named-as-default-member -- axios.create가 공식 사용법이다
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

apiClient.interceptors.request.use(async (config) => {
  if (config.idempotencyKey) {
    config.headers.set('Idempotency-Key', config.idempotencyKey);
  }
  if (!config.skipAuthRefresh && tokenProvider) {
    const accessToken = await tokenProvider.getAccessToken();
    if (accessToken) {
      config.headers.set('Authorization', `Bearer ${accessToken}`);
    }
  }
  return config;
});

apiClient.interceptors.response.use(undefined, async (error: AxiosError<ErrorResponseBody>) => {
  const config = error.config;
  const apiError = toApiError(error);

  if (!config) {
    throw apiError;
  }

  // 401 → 토큰 갱신(단일 인플라이트) → 원 요청 1회 재시도(common-error-handling.md 7)
  if (
    apiError.httpStatus === 401 &&
    !config.skipAuthRefresh &&
    !config.isAuthRetry &&
    tokenProvider
  ) {
    const refreshed = await tokenProvider.refreshTokens();
    if (refreshed) {
      return apiClient.request({ ...config, isAuthRetry: true });
    }
    tokenProvider.onSessionExpired();
    throw apiError;
  }

  if (canAutoRetry(config, apiError)) {
    const retryCount = config.retryCount ?? 0;
    await delay(withJitter(AUTO_RETRY_DELAYS_MS[retryCount] ?? AUTO_RETRY_DELAYS_MS[1]));
    return apiClient.request({ ...config, retryCount: retryCount + 1 });
  }

  logger.debug('[api] request failed', config.url, apiError.errorCode);
  throw apiError;
});
