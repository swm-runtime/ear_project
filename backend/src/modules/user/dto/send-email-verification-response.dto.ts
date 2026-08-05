import { EmailVerificationView } from '../services/email-verification.service';
import {
  EMAIL_VERIFICATION_ATTEMPT_LIMIT,
  EMAIL_VERIFICATION_SEND_LIMIT,
} from '../user.constant';

export class SendEmailVerificationResponseDto {
  readonly verification_id: string;
  readonly email: string;
  readonly expires_at: string;
  readonly resend_available_at: string;
  /** 요청 본문의 `email`에 대한 값이다 — 카운터가 주소 단위이기 때문 (auth-api.md 4.8) */
  readonly send_count_used: number;
  readonly send_count_limit: number;
  readonly attempts_limit: number;

  static from(view: EmailVerificationView): SendEmailVerificationResponseDto {
    return {
      verification_id: view.verificationId,
      email: view.email,
      expires_at: view.expiresAt.toISOString(),
      resend_available_at: view.resendAvailableAt.toISOString(),
      send_count_used: view.sendCountUsed,
      send_count_limit: EMAIL_VERIFICATION_SEND_LIMIT,
      attempts_limit: EMAIL_VERIFICATION_ATTEMPT_LIMIT,
    };
  }
}
