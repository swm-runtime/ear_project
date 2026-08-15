import { randomInt } from 'node:crypto';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { BusinessConflictException } from '@/common/exceptions/business-conflict.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { withMinimumDuration } from '@/common/utils/constant-time.util';
import { equalsInConstantTime, sha256Hex } from '@/common/utils/hash.util';

import { EmailVerificationRepository } from '../repositories/email-verification.repository';
import { EmailVerification } from '../entities/email-verification.entity';
import { MailClient } from '../mail.client';
import {
  EMAIL_VERIFICATION_ACCOUNT_DAILY_SEND_LIMIT,
  EMAIL_VERIFICATION_ACCOUNT_DAILY_WINDOW_SEC,
  EMAIL_VERIFICATION_ACCOUNT_HOURLY_SEND_LIMIT,
  EMAIL_VERIFICATION_ACCOUNT_HOURLY_WINDOW_SEC,
  EMAIL_VERIFICATION_ATTEMPT_LIMIT,
  EMAIL_VERIFICATION_CODE_LENGTH,
  EMAIL_VERIFICATION_CODE_TTL_SEC,
  EMAIL_VERIFICATION_MIN_RESPONSE_MS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC,
  EMAIL_VERIFICATION_SEND_LIMIT,
  EMAIL_VERIFICATION_SEND_WINDOW_SEC,
} from '../user.constant';
import { UserService } from './user.service';

/** 형식만 본다. 존재 여부·도달 여부는 코드 인증이 판정한다 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailVerificationView {
  verificationId: string;
  email: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  sendCountUsed: number;
  attemptsRemaining: number;
  sendLockedUntil: Date | null;
}

type VerifyOutcome =
  | { result: 'verified'; email: string; verifiedAt: Date }
  | { result: 'not_found' }
  | { result: 'expired' }
  | { result: 'attempts_exceeded' }
  | { result: 'mismatch'; attemptsRemaining: number };

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly emailVerificationRepository: EmailVerificationRepository,
    private readonly userService: UserService,
    private readonly mailClient: MailClient,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * auth-api.md 4.8 — 코드 발송.
   * 발송 창 판정은 `(user_id, email)`의 최신 1행만 보고 한다 (domain.md 3.7).
   */
  async sendCode(
    userId: string,
    email: string,
    now: Date,
  ): Promise<EmailVerificationView> {
    return withMinimumDuration(EMAIL_VERIFICATION_MIN_RESPONSE_MS, async () => {
      if (!EMAIL_PATTERN.test(email)) {
        throw new BusinessException({
          status: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.EMAIL_FORMAT_INVALID,
          message: '이메일 형식을 확인해주세요',
        });
      }

      const user = await this.userService.getById(userId);

      // 인증까지 끝난 같은 주소만 막는다. 미인증 주소는 [이 주소로 인증] 경로이므로 보내야 한다
      if (user.email === email && user.isEmailVerified) {
        throw new BusinessConflictException({
          errorCode: ErrorCode.EMAIL_ALREADY_REGISTERED,
          message: '이미 등록된 이메일이에요',
        });
      }

      await this.assertAccountSendBackstop(userId, now);

      const code = this.generateCode();
      const verification = await this.dataSource.transaction(
        async (manager) => {
          const latest =
            await this.emailVerificationRepository.findLatestByUserIdAndEmailForUpdate(
              userId,
              email,
              manager,
            );

          const sendSeq = this.resolveSendSeq(latest, now);

          // 유효한 코드는 항상 마지막 1개다 (domain.md 3.7)
          if (latest && !latest.verifiedAt && !latest.invalidatedAt) {
            latest.invalidatedAt = now;
            await this.emailVerificationRepository.save(latest, manager);
          }

          const created = this.emailVerificationRepository.create({
            userId,
            email,
            codeHash: this.hashCode(email, code),
            sendSeq,
            sentAt: now,
            expiresAt: new Date(
              now.getTime() + EMAIL_VERIFICATION_CODE_TTL_SEC * 1000,
            ),
            attemptCount: 0,
          });

          const saved = await this.emailVerificationRepository.saveIfNoActive(
            created,
            manager,
          );

          // 동시 요청 두 건 중 하나가 부분 유니크 인덱스에 걸린 경우다 (domain.md 3.7).
          // 방금 다른 요청이 발송에 성공했다는 뜻이므로 쿨다운으로 흡수한다
          if (!saved) {
            throw new BusinessException({
              status: HttpStatus.TOO_MANY_REQUESTS,
              errorCode: ErrorCode.EMAIL_VERIFICATION_RESEND_COOLDOWN,
              message: '잠시 후 다시 시도해주세요',
              retryAfterSec: EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC,
              logLevel: 'info',
            });
          }

          return saved;
        },
      );

      // 외부 호출은 트랜잭션 밖에서 한다 (architecture.md 8.3).
      // 발송에 실패하면 행을 남기지 않는다 — 인프라 장애로 5회를 소진시키지 않기 위해서다(domain.md 3.7)
      try {
        await this.mailClient.sendVerificationCode(email, code);
      } catch (error) {
        await this.emailVerificationRepository.deleteById(verification.id);
        this.logger.error(
          'verification mail send failed',
          error instanceof Error ? error.stack : undefined,
          {
            user_id: userId,
          },
        );

        throw new BusinessException({
          status: HttpStatus.BAD_GATEWAY,
          errorCode: ErrorCode.EMAIL_SEND_FAILED,
          message: '인증 메일을 보내지 못했어요. 다시 시도해주세요',
          retryable: true,
          logLevel: 'error',
        });
      }

      return this.toView(verification);
    });
  }

  /** auth-api.md 4.9 — 재진입용 조회. 진행 중인 인증이 없는 것은 정상 상태이므로 404가 아니다 */
  async findActive(
    userId: string,
    now: Date,
  ): Promise<EmailVerificationView | null> {
    const verification =
      await this.emailVerificationRepository.findActiveByUserId(userId, now);
    return verification ? this.toView(verification) : null;
  }

  /**
   * auth-api.md 4.10 — 코드 검증.
   * 검증 시도 기록은 실패해도 남아야 하므로, 트랜잭션 안에서 예외를 던지지 않고
   * 결과를 반환한 뒤 커밋이 끝나고 나서 예외로 변환한다.
   */
  async verifyCode(
    userId: string,
    verificationId: string,
    code: string,
    now: Date,
  ): Promise<{ email: string; verifiedAt: Date }> {
    return withMinimumDuration(EMAIL_VERIFICATION_MIN_RESPONSE_MS, async () => {
      const outcome = await this.dataSource.transaction((manager) =>
        this.applyVerification(userId, verificationId, code, now, manager),
      );

      switch (outcome.result) {
        case 'verified':
          return { email: outcome.email, verifiedAt: outcome.verifiedAt };
        case 'not_found':
          throw new BusinessNotFoundException({
            errorCode: ErrorCode.EMAIL_VERIFICATION_NOT_FOUND,
            message: '인증 정보를 찾을 수 없어요. 코드를 다시 받아주세요',
          });
        case 'expired':
          throw new BusinessException({
            status: HttpStatus.BAD_REQUEST,
            errorCode: ErrorCode.EMAIL_VERIFICATION_CODE_EXPIRED,
            message: '인증 시간이 지났어요. 코드를 다시 받아주세요',
          });
        case 'attempts_exceeded':
          throw new BusinessException({
            status: HttpStatus.BAD_REQUEST,
            errorCode: ErrorCode.EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED,
            message: '코드를 다시 받아주세요',
          });
        case 'mismatch':
          throw new BusinessException({
            status: HttpStatus.BAD_REQUEST,
            errorCode: ErrorCode.EMAIL_VERIFICATION_CODE_MISMATCH,
            message: '인증 코드가 올바르지 않아요',
            details: { attempts_remaining: outcome.attemptsRemaining },
          });
      }
    });
  }

  /** auth-api.md 4.11 — [메일 다시 입력]. 정리성 요청이므로 이미 무효화된 건도 성공으로 본다 */
  async invalidate(
    userId: string,
    verificationId: string,
    now: Date,
  ): Promise<void> {
    const verification =
      await this.emailVerificationRepository.findByIdAndUserId(
        verificationId,
        userId,
      );

    if (
      !verification ||
      verification.verifiedAt ||
      verification.invalidatedAt
    ) {
      return;
    }

    verification.invalidatedAt = now;
    await this.emailVerificationRepository.save(verification);
  }

  /** 탈퇴 시 결제 이력과 무관하게 즉시 파기한다 (domain.md 3.7) */
  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.emailVerificationRepository.deleteByUserId(userId, manager);
  }

  private async applyVerification(
    userId: string,
    verificationId: string,
    code: string,
    now: Date,
    manager: EntityManager,
  ): Promise<VerifyOutcome> {
    const verification =
      await this.emailVerificationRepository.findByIdAndUserId(
        verificationId,
        userId,
        manager,
      );

    if (
      !verification ||
      verification.verifiedAt ||
      verification.invalidatedAt
    ) {
      return { result: 'not_found' };
    }

    if (verification.expiresAt.getTime() <= now.getTime()) {
      return { result: 'expired' };
    }

    if (verification.attemptCount >= EMAIL_VERIFICATION_ATTEMPT_LIMIT) {
      verification.invalidatedAt = now;
      await this.emailVerificationRepository.save(verification, manager);
      return { result: 'attempts_exceeded' };
    }

    verification.attemptCount += 1;
    verification.lastAttemptedAt = now;

    const isMatched = equalsInConstantTime(
      verification.codeHash,
      this.hashCode(verification.email, code),
    );

    if (!isMatched) {
      const attemptsRemaining =
        EMAIL_VERIFICATION_ATTEMPT_LIMIT - verification.attemptCount;

      // 시도를 모두 쓰면 그 코드를 무효화한다 (domain.md 3.7)
      if (attemptsRemaining <= 0) {
        verification.invalidatedAt = now;
        await this.emailVerificationRepository.save(verification, manager);
        return { result: 'attempts_exceeded' };
      }

      await this.emailVerificationRepository.save(verification, manager);
      return { result: 'mismatch', attemptsRemaining };
    }

    verification.verifiedAt = now;
    await this.emailVerificationRepository.save(verification, manager);
    // users.email과 is_email_verified를 같은 트랜잭션에서 쓴다 (auth-api.md 4.10)
    await this.userService.updateVerifiedEmail(
      userId,
      verification.email,
      manager,
    );

    return { result: 'verified', email: verification.email, verifiedAt: now };
  }

  /**
   * auth.md 4.5 — 계정 단위 발송 상한(백스톱). 최근 1시간 20회 / 최근 24시간 50회,
   * 주소 무관 합산이다. **전용 코드·해제 시각을 내려주지 않는다** — 클라이언트 비노출
   * 원칙이며, 노출하면 우회 힌트만 된다. 초과 사유 구분은 로그로만 남긴다(architecture.md 7.5).
   */
  private async assertAccountSendBackstop(
    userId: string,
    now: Date,
  ): Promise<void> {
    const [hourlyCount, dailyCount] = await Promise.all([
      this.emailVerificationRepository.countByUserIdSince(
        userId,
        new Date(
          now.getTime() - EMAIL_VERIFICATION_ACCOUNT_HOURLY_WINDOW_SEC * 1000,
        ),
      ),
      this.emailVerificationRepository.countByUserIdSince(
        userId,
        new Date(
          now.getTime() - EMAIL_VERIFICATION_ACCOUNT_DAILY_WINDOW_SEC * 1000,
        ),
      ),
    ]);

    if (
      hourlyCount >= EMAIL_VERIFICATION_ACCOUNT_HOURLY_SEND_LIMIT ||
      dailyCount >= EMAIL_VERIFICATION_ACCOUNT_DAILY_SEND_LIMIT
    ) {
      this.logger.warn('email send blocked by account backstop', {
        user_id: userId,
        hourly_count: hourlyCount,
        daily_count: dailyCount,
      });

      throw new BusinessException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        errorCode: ErrorCode.TOO_MANY_REQUESTS,
        message: '요청이 많아요. 잠시 후 다시 시도해주세요',
        retryable: true,
        logLevel: 'warn',
      });
    }
  }

  /** domain.md 3.7 — 발송 창은 최신 1행의 `send_seq`와 `sent_at`으로 판정한다 */
  private resolveSendSeq(latest: EmailVerification | null, now: Date): number {
    if (!latest) {
      return 1;
    }

    const elapsedMs = now.getTime() - latest.sentAt.getTime();

    if (latest.sendSeq >= EMAIL_VERIFICATION_SEND_LIMIT) {
      const remainingMs = EMAIL_VERIFICATION_SEND_WINDOW_SEC * 1000 - elapsedMs;

      if (remainingMs > 0) {
        throw new BusinessException({
          status: HttpStatus.TOO_MANY_REQUESTS,
          errorCode: ErrorCode.EMAIL_VERIFICATION_SEND_LIMIT,
          message: '이 주소로는 1시간에 5번까지 보낼 수 있어요',
          retryAfterSec: Math.ceil(remainingMs / 1000),
          logLevel: 'info',
        });
      }

      // 창이 끝났으므로 다시 1번부터 시작한다
      return 1;
    }

    const cooldownRemainingMs =
      EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC * 1000 - elapsedMs;
    if (cooldownRemainingMs > 0) {
      throw new BusinessException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        errorCode: ErrorCode.EMAIL_VERIFICATION_RESEND_COOLDOWN,
        message: '잠시 후 다시 시도해주세요',
        retryAfterSec: Math.ceil(cooldownRemainingMs / 1000),
        logLevel: 'info',
      });
    }

    return latest.sendSeq + 1;
  }

  private toView(verification: EmailVerification): EmailVerificationView {
    const isWindowFull = verification.sendSeq >= EMAIL_VERIFICATION_SEND_LIMIT;

    return {
      verificationId: verification.id,
      email: verification.email,
      expiresAt: verification.expiresAt,
      resendAvailableAt: new Date(
        verification.sentAt.getTime() +
          EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC * 1000,
      ),
      sendCountUsed: verification.sendSeq,
      attemptsRemaining:
        EMAIL_VERIFICATION_ATTEMPT_LIMIT - verification.attemptCount,
      sendLockedUntil: isWindowFull
        ? new Date(
            verification.sentAt.getTime() +
              EMAIL_VERIFICATION_SEND_WINDOW_SEC * 1000,
          )
        : null,
    };
  }

  /**
   * 원문을 저장하지 않는다 (domain.md 3.7).
   * 주소를 함께 해싱해 같은 코드라도 행마다 다른 해시가 되게 한다.
   *
   * TODO(팀 확정): 6자리 코드는 엔트로피가 낮으므로 전용 pepper(HMAC) 도입 여부를 정한다.
   */
  private hashCode(email: string, code: string): string {
    return sha256Hex(`${email}:${code}`);
  }

  private generateCode(): string {
    const max = 10 ** EMAIL_VERIFICATION_CODE_LENGTH;
    return String(randomInt(0, max)).padStart(
      EMAIL_VERIFICATION_CODE_LENGTH,
      '0',
    );
  }
}
