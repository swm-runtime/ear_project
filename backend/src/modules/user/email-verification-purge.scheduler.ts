import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { EmailVerificationService } from './services/email-verification.service';
import { EMAIL_VERIFICATION_PURGE_INTERVAL_MS } from './user.constant';

/**
 * 만료된 이메일 인증 행을 지운다 — domain.md 3.7·12.1의 "만료 24시간 후 hard delete"를
 * **실제로 집행하는 유일한 경로다.**
 *
 * 인증 행에는 이메일 주소와 코드 해시가 남는다. 코드 TTL(3분)이 지나면 인증 목적은 끝나므로
 * 그 뒤의 보관은 개인정보보호법 제21조 제1항(목적 달성 후 지체 없이 파기)의 대상이다 —
 * 멱등키 purge와 같은 논리로, 청소가 아니라 파기 의무의 이행이다. 이 배치가 없던 동안
 * 인증을 시도한 모든 주소가 무기한 남아 있었다(2026-09-09 감사).
 *
 * `idx_email_verifications_expires_at`이 이 삭제를 위해 설계돼 있다(domain.md 3.7).
 * 다중 인스턴스가 동시에 돌아도 안전하다 — 같은 조건의 DELETE라 겹치면 지울 것이 없을 뿐이다.
 */
@Injectable()
export class EmailVerificationPurgeScheduler {
  private readonly logger = new Logger(EmailVerificationPurgeScheduler.name);

  constructor(
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Interval('email-verification-purge', EMAIL_VERIFICATION_PURGE_INTERVAL_MS)
  async purgeExpired(): Promise<void> {
    try {
      const deletedCount = await this.emailVerificationService.purgeExpired(
        new Date(),
      );

      if (deletedCount > 0) {
        this.logger.log('expired email verifications purged', {
          deleted_count: deletedCount,
        });
      }
    } catch (error) {
      // 실패해도 다음 주기가 다시 시도한다 — 던지면 스케줄러가 멈춘다
      this.logger.error(
        'failed to purge expired email verifications',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
