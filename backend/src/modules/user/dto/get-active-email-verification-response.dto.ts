import { EmailVerificationView } from '../services/email-verification.service';
import { EMAIL_VERIFICATION_SEND_LIMIT } from '../user.constant';

/**
 * auth-api.md 4.9 — 진행 중인 인증이 없는 것은 정상 상태이므로 404가 아니다.
 * `active: false`면 어느 주소를 기준으로 셀지 정해지지 않으므로 카운터 값은 null이다.
 */
export class GetActiveEmailVerificationResponseDto {
  readonly active: boolean;
  readonly verification_id: string | null;
  readonly email: string | null;
  readonly expires_at: string | null;
  readonly attempts_remaining: number | null;
  readonly resend_available_at: string | null;
  readonly send_count_used: number | null;
  readonly send_count_limit: number;
  readonly send_locked_until: string | null;

  static from(
    view: EmailVerificationView | null,
  ): GetActiveEmailVerificationResponseDto {
    if (!view) {
      return {
        active: false,
        verification_id: null,
        email: null,
        expires_at: null,
        attempts_remaining: null,
        resend_available_at: null,
        send_count_used: null,
        send_count_limit: EMAIL_VERIFICATION_SEND_LIMIT,
        send_locked_until: null,
      };
    }

    return {
      active: true,
      verification_id: view.verificationId,
      email: view.email,
      expires_at: view.expiresAt.toISOString(),
      attempts_remaining: view.attemptsRemaining,
      resend_available_at: view.resendAvailableAt.toISOString(),
      send_count_used: view.sendCountUsed,
      send_count_limit: EMAIL_VERIFICATION_SEND_LIMIT,
      send_locked_until: view.sendLockedUntil?.toISOString() ?? null,
    };
  }
}
