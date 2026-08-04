import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';

import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { EnvironmentVariables } from '@/config/env.validation';
import { Subscription } from '@/modules/subscription/subscription.entity';
import { SubscriptionService } from '@/modules/subscription/subscription.service';

import { ArchiveRepository } from '../repositories/archive.repository';
import { ConsentService } from './consent.service';
import { EmailVerificationService } from './email-verification.service';
import { User } from '../entities/user.entity';
import { UserService } from './user.service';
import { UserWithdrawalService } from './user-withdrawal.service';
import { WithdrawalLogRepository } from '../repositories/withdrawal-log.repository';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-04T09:00:00.000Z');

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: 'user@example.com',
    provider: 'kakao',
    providerUserId: 'kakao-1',
    tier: 'light',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as User;
}

describe('UserWithdrawalService', () => {
  let service: UserWithdrawalService;
  let userService: jest.Mocked<UserService>;
  let consentService: jest.Mocked<ConsentService>;
  let emailVerificationService: jest.Mocked<EmailVerificationService>;
  let subscriptionService: jest.Mocked<SubscriptionService>;
  let archiveRepository: jest.Mocked<ArchiveRepository>;
  let withdrawalLogRepository: jest.Mocked<WithdrawalLogRepository>;

  const command = {
    userId: USER_ID,
    reasonCode: 'low_usage',
    reasonText: null,
    confirm: true,
    agreedSubscriptionExpiry: false,
  };

  beforeEach(() => {
    userService = {
      getById: jest.fn(() => Promise.resolve(buildUser())),
      deleteById: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

    consentService = {
      findAllByUserId: jest.fn(() => Promise.resolve([])),
      purgeByUserId: jest.fn(),
    } as unknown as jest.Mocked<ConsentService>;

    emailVerificationService = {
      purgeByUserId: jest.fn(),
    } as unknown as jest.Mocked<EmailVerificationService>;

    subscriptionService = {
      hasPaymentHistory: jest.fn(() => Promise.resolve(false)),
      hasLiveSubscription: jest.fn(() => Promise.resolve(false)),
      findAllByUserId: jest.fn(() => Promise.resolve([])),
      purgeByUserId: jest.fn(),
    } as unknown as jest.Mocked<SubscriptionService>;

    archiveRepository = {
      createUser: jest.fn((value: unknown) => value),
      createConsent: jest.fn((value: unknown) => value),
      createSubscription: jest.fn((value: unknown) => value),
      saveUser: jest.fn(),
      saveConsents: jest.fn(),
      saveSubscriptions: jest.fn(),
    } as unknown as jest.Mocked<ArchiveRepository>;

    withdrawalLogRepository = {
      create: jest.fn((value: unknown) => value),
      save: jest.fn(),
    } as unknown as jest.Mocked<WithdrawalLogRepository>;

    const configService = {
      get: jest.fn(() => 'test-pepper'),
    } as unknown as ConfigService<EnvironmentVariables, true>;

    const dataSource = {
      transaction: (
        runInTransaction: (manager: EntityManager) => Promise<unknown>,
      ) => runInTransaction({} as EntityManager),
    } as unknown as DataSource;

    service = new UserWithdrawalService(
      userService,
      consentService,
      emailVerificationService,
      subscriptionService,
      archiveRepository,
      withdrawalLogRepository,
      configService,
      dataSource,
    );
  });

  describe('withdraw', () => {
    it('안내 확인을 체크하지 않으면 탈퇴를 거부한다', async () => {
      // given
      const notConfirmed = { ...command, confirm: false };

      // when
      const withdrawing = service.withdraw(notConfirmed, NOW);

      // then
      await expect(withdrawing).rejects.toMatchObject({
        errorCode: ErrorCode.WITHDRAWAL_CONFIRM_REQUIRED,
      });
      expect(userService.deleteById).not.toHaveBeenCalled();
    });

    it('활성 구독이 있는데 만료 동의가 없으면 탈퇴를 거부한다', async () => {
      // given
      subscriptionService.hasPaymentHistory.mockResolvedValue(true);
      subscriptionService.hasLiveSubscription.mockResolvedValue(true);

      // when
      const withdrawing = service.withdraw(command, NOW);

      // then
      await expect(withdrawing).rejects.toMatchObject({
        errorCode: ErrorCode.WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED,
      });
      expect(userService.deleteById).not.toHaveBeenCalled();
    });

    it('결제 이력이 없으면 아카이브하지 않고 전량 파기한다', async () => {
      // given
      subscriptionService.hasPaymentHistory.mockResolvedValue(false);

      // when
      await service.withdraw(command, NOW);

      // then
      expect(archiveRepository.saveUser).not.toHaveBeenCalled();
      expect(archiveRepository.saveConsents).not.toHaveBeenCalled();
      expect(userService.deleteById).toHaveBeenCalledWith(USER_ID, {});
    });

    it('결제 이력이 있으면 아카이브한 뒤 파기한다', async () => {
      // given
      subscriptionService.hasPaymentHistory.mockResolvedValue(true);
      subscriptionService.findAllByUserId.mockResolvedValue([
        { originalTransactionId: 'tx-1' } as Subscription,
      ]);

      // when
      await service.withdraw(command, NOW);

      // then
      expect(archiveRepository.saveUser).toHaveBeenCalledTimes(1);
      expect(archiveRepository.saveSubscriptions).toHaveBeenCalledTimes(1);
      expect(userService.deleteById).toHaveBeenCalledWith(USER_ID, {});
    });

    it('결제 이력이 있는데 이메일이 없으면 탈퇴를 실패시킨다', async () => {
      // given
      subscriptionService.hasPaymentHistory.mockResolvedValue(true);
      userService.getById.mockResolvedValue(buildUser({ email: null }));

      // when
      const withdrawing = service.withdraw(command, NOW);

      // then
      await expect(withdrawing).rejects.toMatchObject({
        errorCode: ErrorCode.WITHDRAWAL_ARCHIVE_IDENTITY_MISSING,
      });
      expect(userService.deleteById).not.toHaveBeenCalled();
    });

    it('탈퇴하면 결제 이력과 무관하게 탈퇴 로그를 남긴다', async () => {
      // given
      subscriptionService.hasPaymentHistory.mockResolvedValue(false);

      // when
      await service.withdraw(command, NOW);

      // then
      expect(withdrawalLogRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPreview', () => {
    it('결제 이력이 없으면 보존 항목을 null로 내려준다', async () => {
      // given
      subscriptionService.hasPaymentHistory.mockResolvedValue(false);

      // when
      const preview = await service.getPreview(USER_ID);

      // then
      expect(preview.retained).toBeNull();
    });

    it('결제 이력이 있으면 5년 보존 항목을 내려준다', async () => {
      // given
      subscriptionService.hasPaymentHistory.mockResolvedValue(true);

      // when
      const preview = await service.getPreview(USER_ID);

      // then
      expect(preview.retained).toEqual({
        years: 5,
        items: ['email', 'subscription_history', 'consent_history'],
      });
    });
  });
});
