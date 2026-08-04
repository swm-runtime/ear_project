import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { hmacSha256Hex } from '@/common/utils/hash.util';
import { EnvironmentVariables } from '@/config/env.validation';
import { SubscriptionService } from '@/modules/subscription/subscription.service';

import { ArchiveRepository } from '../repositories/archive.repository';
import { ConsentService } from './consent.service';
import { EmailVerificationService } from './email-verification.service';
import { User } from '../entities/user.entity';
import { USER_HASH_VERSION } from '../user.constant';
import { UserService } from './user.service';
import { WithdrawUserCommand } from '../user.types';
import { WithdrawalLogRepository } from '../repositories/withdrawal-log.repository';

/** 아카이브 보존 기간 — 전자상거래법 시행령 제6조 (domain.md 11장) */
export const ARCHIVE_RETENTION_YEARS = 5;

export interface WithdrawalPreview {
  hasPaymentHistory: boolean;
  hasActiveSubscription: boolean;
  subscriptionExpiryAgreementRequired: boolean;
  retained: { years: number; items: string[] } | null;
}

/**
 * 회원 탈퇴 — 결제 이력 유무로 처리가 갈린다 (domain.md 12.3, auth.md 4.3).
 *
 * 여러 도메인을 조합하는 유스케이스이므로 결제 이력 판정은
 * `subscription` 모듈이 노출한 Service로만 조회한다 (architecture.md 4.3).
 */
@Injectable()
export class UserWithdrawalService {
  private readonly logger = new Logger(UserWithdrawalService.name);

  constructor(
    private readonly userService: UserService,
    private readonly consentService: ConsentService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly subscriptionService: SubscriptionService,
    private readonly archiveRepository: ArchiveRepository,
    private readonly withdrawalLogRepository: WithdrawalLogRepository,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly dataSource: DataSource,
  ) {}

  /** auth-api.md 4.6 — 안내 문구 분기는 서버가 판정한다. 클라이언트가 로컬 상태로 추측하지 않는다 */
  async getPreview(userId: string): Promise<WithdrawalPreview> {
    const hasPaymentHistory =
      await this.subscriptionService.hasPaymentHistory(userId);
    const hasActiveSubscription =
      await this.subscriptionService.hasLiveSubscription(userId);

    return {
      hasPaymentHistory,
      hasActiveSubscription,
      subscriptionExpiryAgreementRequired: hasActiveSubscription,
      // 보존 항목이 0건인 것과 보존 자체가 없는 것은 화면이 다르다 → 빈 배열이 아니라 null
      retained: hasPaymentHistory
        ? {
            years: ARCHIVE_RETENTION_YEARS,
            items: ['email', 'subscription_history', 'consent_history'],
          }
        : null,
    };
  }

  /**
   * 이관과 파기는 **하나의 트랜잭션**에서 수행한다 (domain.md 12.3).
   * 이관만 되고 파기가 실패하면 개인정보가 두 곳에 남는다.
   */
  async withdraw(command: WithdrawUserCommand, now: Date): Promise<void> {
    if (!command.confirm) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.WITHDRAWAL_CONFIRM_REQUIRED,
        message: '안내를 확인해주세요',
      });
    }

    await this.dataSource.transaction(async (manager) => {
      const user = await this.userService.getById(command.userId, manager);

      // 안내 화면에 내려준 값을 신뢰하지 않고 트랜잭션 안에서 다시 판정한다 (domain.md 12.3)
      const hasPaymentHistory =
        await this.subscriptionService.hasPaymentHistory(user.id, manager);
      const hasLiveSubscription =
        await this.subscriptionService.hasLiveSubscription(user.id, manager);

      if (hasLiveSubscription && !command.agreedSubscriptionExpiry) {
        throw new BusinessException({
          status: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED,
          message: '구독 만료에 동의해야 탈퇴할 수 있어요',
        });
      }

      if (hasPaymentHistory) {
        await this.archive(user, now, manager);
      }

      await this.purge(user.id, manager);
      await this.recordWithdrawalLog(user.id, command, now, manager);
    });

    this.logger.log('user withdrawn', { user_id: command.userId });
  }

  /** domain.md 12.3 — 결제 이력이 있는 사용자만 아카이브한다 */
  private async archive(
    user: User,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    // 결제 이력이 있는데 이메일이 없다는 것은 결제 전 이메일 게이트가 뚫렸다는 뜻이다.
    // 조용히 NULL을 넣지 않고 트랜잭션을 실패시킨다 (domain.md 11.3)
    if (!user.email) {
      throw new BusinessException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ErrorCode.WITHDRAWAL_ARCHIVE_IDENTITY_MISSING,
        message: '탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해주세요',
        logLevel: 'error',
      });
    }

    const userHash = this.hashForArchive(user.id);

    await this.archiveRepository.saveUser(
      this.archiveRepository.createUser({
        userHash,
        userHashVersion: USER_HASH_VERSION,
        email: user.email,
        provider: user.provider,
        providerUserId: user.providerUserId,
        tier: user.tier,
        joinedAt: user.createdAt,
        withdrawnAt: now,
        archivedAt: now,
      }),
      manager,
    );

    const consents = await this.consentService.findAllByUserId(
      user.id,
      manager,
    );
    await this.archiveRepository.saveConsents(
      consents.map((consent) =>
        this.archiveRepository.createConsent({
          userHash,
          userHashVersion: USER_HASH_VERSION,
          consentType: consent.consentType,
          version: consent.version,
          isAgreed: consent.isAgreed,
          agreedAt: consent.agreedAt,
          archivedAt: now,
        }),
      ),
      manager,
    );

    const subscriptions = await this.subscriptionService.findAllByUserId(
      user.id,
      manager,
    );
    await this.archiveRepository.saveSubscriptions(
      subscriptions.map((subscription) =>
        this.archiveRepository.createSubscription({
          userHash,
          userHashVersion: USER_HASH_VERSION,
          originalTransactionId: subscription.originalTransactionId,
          store: subscription.store,
          tier: subscription.tier,
          status: subscription.status,
          startedAt: subscription.startedAt,
          expiresAt: subscription.expiresAt,
          cancelledAt: subscription.cancelledAt,
          archivedAt: now,
        }),
      ),
      manager,
    );
  }

  /**
   * 즉시 파기. `users` 행은 결제 이력 유무와 무관하게 삭제한다 —
   * `status = withdrawn`으로 남기면 제21조 제3항의 분리 저장 요건을 충족하지 못한다.
   *
   * `sessions` · `consents`는 `users` FK의 ON DELETE CASCADE로 함께 사라진다.
   *
   * TODO(모듈 도입 시): domain.md 12.3의 나머지 즉시 파기 대상
   * (`library_items` · `playback_progresses` · `play_records` · `user_signals` ·
   * `user_interests` · `user_settings` · `device_tokens` · `user_preference_vectors` ·
   * `drip_excluded_contents` · `purchase_intents` · `notification_logs` · `first_drip_jobs`)은
   * 해당 모듈이 생기는 시점에 각 모듈 Service의 purge 호출을 여기에 추가한다.
   */
  private async purge(userId: string, manager: EntityManager): Promise<void> {
    await this.emailVerificationService.purgeByUserId(userId, manager);
    await this.subscriptionService.purgeByUserId(userId, manager);
    await this.consentService.purgeByUserId(userId, manager);
    await this.userService.deleteById(userId, manager);
  }

  /** 탈퇴 사유는 집계 목적이므로 아카이브와 **다른 pepper**로 해싱한다 (domain.md 11.2) */
  private async recordWithdrawalLog(
    userId: string,
    command: WithdrawUserCommand,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    await this.withdrawalLogRepository.save(
      this.withdrawalLogRepository.create({
        userHash: hmacSha256Hex(
          this.configService.get('WITHDRAWAL_HASH_PEPPER', { infer: true }),
          userId,
        ),
        userHashVersion: USER_HASH_VERSION,
        reasonCode: command.reasonCode,
        reasonText: command.reasonText,
        withdrawnAt: now,
      }),
      manager,
    );
  }

  private hashForArchive(userId: string): string {
    return hmacSha256Hex(
      this.configService.get('ARCHIVE_HASH_PEPPER', { infer: true }),
      userId,
    );
  }
}
