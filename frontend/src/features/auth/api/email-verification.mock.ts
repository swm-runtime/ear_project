/**
 * 이메일 인증 API mock — 백엔드 없이 A10~A18 흐름을 테스트하는 서버 대역이다.
 * 다른 mock과 같은 관례로 api 모듈 진입점에서 구현체만 갈아끼운다(DTO를 반환한다).
 *
 * 판정 규칙은 auth-api.md 4.8~4.11을 그대로 흉내 낸다 — 쿨다운 30초·유효 3분·
 * 주소당 5회·검증 5회. 시각 판정이 실제로 동작하므로 화면의 카운트다운·쿨다운을
 * 그대로 검증할 수 있다.
 *
 * 조작 규칙(입력값으로 경로를 고른다 — 시나리오 전환 없이 한 세션에서 전부 확인 가능):
 * - 올바른 인증 코드는 항상 `123456`. 그 외는 불일치.
 * - 자신의 인증된 주소(기본 user@example.com)를 다시 입력 → EMAIL_ALREADY_REGISTERED
 * - `sendfail@example.com`   → EMAIL_SEND_FAILED (retryable, 횟수 미차감)
 * - `limit@example.com`      → EMAIL_VERIFICATION_SEND_LIMIT (43분 잠금 상태)
 *
 * 시나리오 전환(EXPO_PUBLIC_EMAIL_VERIFICATION_MOCK_SCENARIO):
 * - (기본)        이메일 등록·인증됨 — [변경] 흐름
 * - unregistered  이메일 없음 — A10 "등록되지 않음" + [등록] 흐름
 * - unverified    주소 있음 + 미인증 — 배지·[인증하기] 흐름
 * - short-expiry  유효 15초·쿨다운 5초 — 만료(A15)·재전송을 기다리지 않고 확인
 *
 * 계정 이메일 상태의 원본은 이 mock 하나다 — 프로필·설정 mock이 `getEmailMockAccount()`로
 * 읽어, 인증 성공 후 복귀 시 두 화면의 갱신을 함께 본다(career mock과 같은 패턴).
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type {
  ActiveEmailVerificationResponseDto,
  SendEmailVerificationResponseDto,
  VerifyEmailResponseDto,
} from './email-verification.api';

const SCENARIO = process.env.EXPO_PUBLIC_EMAIL_VERIFICATION_MOCK_SCENARIO ?? 'default';

/** 스켈레톤 0.3초 규칙(useDelayedVisible)이 실제로 노출되는 지연 — 다른 mock과 동일 값 */
const RESPONSE_DELAY_MS = 600;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const CORRECT_CODE = '123456';
const SEND_FAIL_EMAIL = 'sendfail@example.com';
const SEND_LOCKED_EMAIL = 'limit@example.com';

/** auth.md 4.5의 값들 — short-expiry 시나리오는 기다리지 않아도 되게 줄인다 */
const CODE_TTL_MS = SCENARIO === 'short-expiry' ? 15_000 : 3 * 60_000;
const RESEND_COOLDOWN_MS = SCENARIO === 'short-expiry' ? 5_000 : 30_000;
const SEND_COUNT_LIMIT = 5;
const ATTEMPTS_LIMIT = 5;
const SEND_LOCK_MS = 60 * 60_000;

interface MockAccountEmail {
  email: string | null;
  is_email_verified: boolean;
}

interface MockActiveVerification {
  id: string;
  email: string;
  expiresAtMs: number;
  attemptsRemaining: number;
  resendAvailableAtMs: number;
  invalidated: boolean;
  verified: boolean;
}

const initialAccount = (): MockAccountEmail => {
  switch (SCENARIO) {
    case 'unregistered':
      return { email: null, is_email_verified: false };
    case 'unverified':
      return { email: 'user@example.com', is_email_verified: false };
    default:
      return { email: 'user@example.com', is_email_verified: true };
  }
};

let account = initialAccount();
let active: MockActiveVerification | null = null;
/** 주소별 발송 성공 시각 — 5회째 시각 + 1시간까지 잠금, 지나면 창 초기화(auth-api.md 4.8) */
const sendLog = new Map<string, number[]>();
let idSeq = 0;

export const resetEmailVerificationMock = (): void => {
  account = initialAccount();
  active = null;
  sendLog.clear();
  idSeq = 0;
};

/** 프로필·설정 mock이 읽는 계정 이메일 원본(profile-api.md 4.1의 user 필드 대역) */
export const getEmailMockAccount = (): MockAccountEmail => ({ ...account });

/** 그 주소의 잠금 해제 시각(ms). 잠기지 않았으면 null. 창이 끝났으면 로그를 초기화한다 */
const lockedUntilMs = (email: string, nowMs: number): number | null => {
  if (email === SEND_LOCKED_EMAIL) return nowMs + 43 * 60_000;
  const log = sendLog.get(email) ?? [];
  if (log.length < SEND_COUNT_LIMIT) return null;
  const unlockAt = log[log.length - 1] + SEND_LOCK_MS;
  if (nowMs >= unlockAt) {
    sendLog.set(email, []);
    return null;
  }
  return unlockAt;
};

const toActiveDto = (nowMs: number): ActiveEmailVerificationResponseDto => {
  // 검증 완료·무효화된 건은 없음이다(auth-api.md 4.9). 만료는 유지한다 — 화면이 A15를 그린다
  if (active === null || active.invalidated || active.verified) {
    return {
      active: false,
      verification_id: null,
      email: null,
      expires_at: null,
      attempts_remaining: null,
      resend_available_at: null,
      send_count_used: null,
      send_count_limit: SEND_COUNT_LIMIT,
      send_locked_until: null,
    };
  }
  const locked = lockedUntilMs(active.email, nowMs);
  return {
    active: true,
    verification_id: active.id,
    email: active.email,
    expires_at: new Date(active.expiresAtMs).toISOString(),
    attempts_remaining: active.attemptsRemaining,
    resend_available_at: new Date(active.resendAvailableAtMs).toISOString(),
    send_count_used: (sendLog.get(active.email) ?? []).length,
    send_count_limit: SEND_COUNT_LIMIT,
    send_locked_until: locked === null ? null : new Date(locked).toISOString(),
  };
};

export const mockFetchActiveVerification =
  async (): Promise<ActiveEmailVerificationResponseDto> => {
    await delay(RESPONSE_DELAY_MS);
    return toActiveDto(Date.now());
  };

export const mockSendVerification = async (
  email: string,
): Promise<SendEmailVerificationResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const nowMs = Date.now();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(
      ERROR_CODES.EMAIL_FORMAT_INVALID,
      '이메일 형식을 확인해주세요',
      false,
      null,
      null,
      400,
    );
  }

  // 인증까지 끝난 같은 주소만 409다 — 미인증 주소는 정상 발송된다(auth-api.md 4.8)
  if (account.email === email && account.is_email_verified) {
    throw new ApiError(
      ERROR_CODES.EMAIL_ALREADY_REGISTERED,
      '이미 등록된 이메일이에요',
      false,
      null,
      null,
      409,
    );
  }

  const locked = lockedUntilMs(email, nowMs);
  if (locked !== null) {
    throw new ApiError(
      ERROR_CODES.EMAIL_VERIFICATION_SEND_LIMIT,
      '이 주소로는 지금 보낼 수 없어요',
      false,
      Math.ceil((locked - nowMs) / 1000),
      null,
      429,
    );
  }

  const lastSentAt = (sendLog.get(email) ?? []).at(-1);
  if (lastSentAt !== undefined && nowMs - lastSentAt < RESEND_COOLDOWN_MS) {
    throw new ApiError(
      ERROR_CODES.EMAIL_VERIFICATION_RESEND_COOLDOWN,
      '잠시 후 다시 보낼 수 있어요',
      false,
      Math.ceil((RESEND_COOLDOWN_MS - (nowMs - lastSentAt)) / 1000),
      null,
      429,
    );
  }

  // 발송 실패는 횟수를 차감하지 않는다(auth-api.md 4.8)
  if (email === SEND_FAIL_EMAIL) {
    throw new ApiError(
      ERROR_CODES.EMAIL_SEND_FAILED,
      '인증 메일을 보내지 못했어요',
      true,
      null,
      null,
      502,
    );
  }

  // 발송 성공 — 이전 코드는 즉시 무효(동시 유효 코드 1개)
  if (active !== null) active.invalidated = true;
  const log = sendLog.get(email) ?? [];
  log.push(nowMs);
  sendLog.set(email, log);
  idSeq += 1;
  active = {
    id: `email-verification-${idSeq}`,
    email,
    expiresAtMs: nowMs + CODE_TTL_MS,
    attemptsRemaining: ATTEMPTS_LIMIT,
    resendAvailableAtMs: nowMs + RESEND_COOLDOWN_MS,
    invalidated: false,
    verified: false,
  };

  return {
    verification_id: active.id,
    email,
    expires_at: new Date(active.expiresAtMs).toISOString(),
    resend_available_at: new Date(active.resendAvailableAtMs).toISOString(),
    send_count_used: log.length,
    send_count_limit: SEND_COUNT_LIMIT,
    attempts_limit: ATTEMPTS_LIMIT,
  };
};

export const mockVerifyCode = async (
  verificationId: string,
  code: string,
): Promise<VerifyEmailResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const nowMs = Date.now();

  if (
    active === null ||
    active.invalidated ||
    active.verified ||
    active.id !== verificationId
  ) {
    throw new ApiError(
      ERROR_CODES.EMAIL_VERIFICATION_NOT_FOUND,
      '진행 중인 인증이 없어요',
      false,
      null,
      null,
      404,
    );
  }

  if (nowMs > active.expiresAtMs) {
    throw new ApiError(
      ERROR_CODES.EMAIL_VERIFICATION_CODE_EXPIRED,
      '인증 시간이 지났어요',
      false,
      null,
      null,
      400,
    );
  }

  if (code !== CORRECT_CODE) {
    active.attemptsRemaining -= 1;
    if (active.attemptsRemaining <= 0) {
      // 시도 소진 → 코드 무효. 재발송만 남는다(auth-api.md 4.10)
      active.invalidated = true;
      throw new ApiError(
        ERROR_CODES.EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED,
        '코드를 다시 받아주세요',
        false,
        null,
        null,
        400,
      );
    }
    throw new ApiError(
      ERROR_CODES.EMAIL_VERIFICATION_CODE_MISMATCH,
      '인증 코드가 올바르지 않아요',
      false,
      null,
      null,
      400,
    );
  }

  // 성공 — 서버가 email과 is_email_verified를 같은 트랜잭션에서 저장한다(auth-api.md 4.10)
  account = { email: active.email, is_email_verified: true };
  active.verified = true;
  return {
    email: account.email as string,
    is_email_verified: true,
    verified_at: new Date(nowMs).toISOString(),
  };
};

export const mockInvalidateVerification = async (verificationId: string): Promise<void> => {
  await delay(RESPONSE_DELAY_MS);
  // 이미 무효화·만료된 건에도 성공으로 응답한다 — 정리성 요청이다(auth-api.md 4.11)
  if (active !== null && active.id === verificationId) {
    active.invalidated = true;
  }
};
