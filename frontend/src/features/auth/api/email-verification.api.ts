import { apiClient } from '@/shared/api/api-client';

import { IS_EMAIL_VERIFICATION_API_MOCKED } from '../auth.constants';
import type { ActiveEmailVerification, EmailVerifiedResult } from '../auth.types';
import {
  mockFetchActiveVerification,
  mockInvalidateVerification,
  mockSendVerification,
  mockVerifyCode,
} from './email-verification.mock';

/* ── DTO — auth-api.md 4.8~4.11 계약 그대로 snake_case로 선언한다(convention.md 1.6) ── */

export interface SendEmailVerificationResponseDto {
  verification_id: string;
  email: string;
  expires_at: string;
  resend_available_at: string;
  send_count_used: number;
  send_count_limit: number;
  attempts_limit: number;
}

export interface ActiveEmailVerificationResponseDto {
  active: boolean;
  verification_id: string | null;
  email: string | null;
  expires_at: string | null;
  attempts_remaining: number | null;
  resend_available_at: string | null;
  /** 없음(active: false)이면 기준 주소가 없어 null이다(auth-api.md 4.9) */
  send_count_used: number | null;
  send_count_limit: number;
  send_locked_until: string | null;
}

export interface VerifyEmailResponseDto {
  email: string;
  is_email_verified: boolean;
  verified_at: string;
}

/* ── Query Key factory(convention.md 4.1) ── */

export const emailVerificationKeys = {
  all: ['emailVerification'] as const,
  /** 재진입 시 이어서 입력하기 위한 진행 중 인증 조회(auth-api.md 4.9) */
  active: () => [...emailVerificationKeys.all, 'active'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toActiveFromSend = (dto: SendEmailVerificationResponseDto): ActiveEmailVerification => ({
  verificationId: dto.verification_id,
  email: dto.email,
  expiresAt: dto.expires_at,
  attemptsRemaining: dto.attempts_limit,
  resendAvailableAt: dto.resend_available_at,
  sendCountUsed: dto.send_count_used,
  sendCountLimit: dto.send_count_limit,
  sendLockedUntil: null,
});

const toActive = (dto: ActiveEmailVerificationResponseDto): ActiveEmailVerification | null => {
  if (
    !dto.active ||
    dto.verification_id === null ||
    dto.email === null ||
    dto.expires_at === null ||
    dto.attempts_remaining === null ||
    dto.resend_available_at === null
  ) {
    return null;
  }
  return {
    verificationId: dto.verification_id,
    email: dto.email,
    expiresAt: dto.expires_at,
    attemptsRemaining: dto.attempts_remaining,
    resendAvailableAt: dto.resend_available_at,
    sendCountUsed: dto.send_count_used ?? 0,
    sendCountLimit: dto.send_count_limit,
    sendLockedUntil: dto.send_locked_until,
  };
};

const toVerifiedResult = (dto: VerifyEmailResponseDto): EmailVerifiedResult => ({
  email: dto.email,
  isEmailVerified: dto.is_email_verified,
  verifiedAt: dto.verified_at,
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/** 진행 중 인증 조회(auth-api.md 4.9) — 없음은 404가 아니라 null이다 */
export const fetchActiveVerification = async (): Promise<ActiveEmailVerification | null> => {
  const data = IS_EMAIL_VERIFICATION_API_MOCKED
    ? await mockFetchActiveVerification()
    : (
        await apiClient.get<ActiveEmailVerificationResponseDto>(
          '/users/me/email-verifications/active',
        )
      ).data;
  return toActive(data);
};

/**
 * 인증 코드 발송(auth-api.md 4.8) — Idempotency-Key 필수. 연타 재전송이 발송 횟수를
 * 소모하면 안 된다. 키는 호출자가 시도 단위로 발급한다(재시도 간 재사용).
 */
export const sendEmailVerification = async (input: {
  email: string;
  idempotencyKey: string;
}): Promise<ActiveEmailVerification> => {
  const data = IS_EMAIL_VERIFICATION_API_MOCKED
    ? await mockSendVerification(input.email)
    : (
        await apiClient.post<SendEmailVerificationResponseDto>(
          '/users/me/email-verifications',
          { email: input.email },
          { idempotencyKey: input.idempotencyKey },
        )
      ).data;
  return toActiveFromSend(data);
};

/** 코드 검증(auth-api.md 4.10) — 성공 시 서버가 users에 저장까지 끝낸 결과가 온다 */
export const verifyEmailCode = async (input: {
  verificationId: string;
  code: string;
}): Promise<EmailVerifiedResult> => {
  const data = IS_EMAIL_VERIFICATION_API_MOCKED
    ? await mockVerifyCode(input.verificationId, input.code)
    : (
        await apiClient.post<VerifyEmailResponseDto>(
          `/users/me/email-verifications/${input.verificationId}/verify`,
          { code: input.code },
        )
      ).data;
  return toVerifiedResult(data);
};

/**
 * 진행 중 인증 무효화(auth-api.md 4.11) — [메일 다시 입력] 시 호출한다.
 * 실패해도 화면은 되돌아간다 — 코드는 3분 뒤 만료되고 다음 발송이 어차피 무효화한다.
 */
export const invalidateEmailVerification = async (verificationId: string): Promise<void> => {
  if (IS_EMAIL_VERIFICATION_API_MOCKED) {
    await mockInvalidateVerification(verificationId);
    return;
  }
  await apiClient.delete(`/users/me/email-verifications/${verificationId}`);
};
