import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { sha256Hex } from '@/common/utils/hash.util';

import { EmailVerificationRepository } from '../repositories/email-verification.repository';
import { EmailVerificationService } from './email-verification.service';
import { EmailVerification } from '../entities/email-verification.entity';
import { User } from '../entities/user.entity';
import { MailClient } from '../mail.client';
import { UserService } from './user.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'user@example.com';
const NOW = new Date('2026-08-04T09:00:00.000Z');

function buildVerification(
  overrides: Partial<EmailVerification> = {},
): EmailVerification {
  return {
    id: '1',
    userId: USER_ID,
    email: EMAIL,
    codeHash: sha256Hex(`${EMAIL}:482913`),
    sendSeq: 1,
    sentAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 60_000),
    attemptCount: 0,
    lastAttemptedAt: null,
    verifiedAt: null,
    invalidatedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as EmailVerification;
}

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let repository: jest.Mocked<EmailVerificationRepository>;
  let userService: jest.Mocked<UserService>;
  let mailClient: jest.Mocked<MailClient>;

  beforeEach(() => {
    repository = {
      create: jest.fn(
        (value: Partial<EmailVerification>) => value as EmailVerification,
      ),
      save: jest.fn((value: EmailVerification) => Promise.resolve(value)),
      saveIfNoActive: jest.fn((value: EmailVerification) =>
        Promise.resolve(value),
      ),
      findLatestByUserIdAndEmailForUpdate: jest.fn(),
      countByUserIdSince: jest.fn(() => Promise.resolve(0)),
      findActiveByUserId: jest.fn(),
      findByIdAndUserId: jest.fn(),
      deleteById: jest.fn(),
      deleteByUserId: jest.fn(),
    } as unknown as jest.Mocked<EmailVerificationRepository>;

    userService = {
      getById: jest.fn(() =>
        Promise.resolve({
          id: USER_ID,
          email: null,
          isEmailVerified: false,
        } as User),
      ),
      updateVerifiedEmail: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

    mailClient = { sendVerificationCode: jest.fn() };

    const dataSource = {
      transaction: (
        runInTransaction: (manager: EntityManager) => Promise<unknown>,
      ) => runInTransaction({} as EntityManager),
    } as unknown as DataSource;

    service = new EmailVerificationService(
      repository,
      userService,
      mailClient,
      dataSource,
    );
  });

  describe('sendCode', () => {
    it('직전 발송 기록이 없으면 첫 번째 발송으로 코드를 보낸다', async () => {
      // given
      repository.findLatestByUserIdAndEmailForUpdate.mockResolvedValue(null);

      // when
      const view = await service.sendCode(USER_ID, EMAIL, NOW);

      // then
      expect(view.sendCountUsed).toBe(1);
      expect(mailClient.sendVerificationCode).toHaveBeenCalledTimes(1);
    });

    it('직전 발송으로부터 30초가 지나지 않았으면 쿨다운으로 거절한다', async () => {
      // given
      repository.findLatestByUserIdAndEmailForUpdate.mockResolvedValue(
        buildVerification({
          sendSeq: 2,
          sentAt: new Date(NOW.getTime() - 10_000),
        }),
      );

      // when
      const sending = service.sendCode(USER_ID, EMAIL, NOW);

      // then
      await expect(sending).rejects.toMatchObject({
        errorCode: ErrorCode.EMAIL_VERIFICATION_RESEND_COOLDOWN,
        retryAfterSec: 20,
      });
    });

    it('그 주소로 5회를 보내고 1시간이 지나지 않았으면 발송을 잠근다', async () => {
      // given
      repository.findLatestByUserIdAndEmailForUpdate.mockResolvedValue(
        buildVerification({
          sendSeq: 5,
          sentAt: new Date(NOW.getTime() - 600_000),
        }),
      );

      // when
      const sending = service.sendCode(USER_ID, EMAIL, NOW);

      // then
      await expect(sending).rejects.toMatchObject({
        errorCode: ErrorCode.EMAIL_VERIFICATION_SEND_LIMIT,
        retryAfterSec: 3000,
      });
    });

    it('5회를 보낸 시점으로부터 1시간이 지나면 발송 창이 초기화된다', async () => {
      // given
      repository.findLatestByUserIdAndEmailForUpdate.mockResolvedValue(
        buildVerification({
          sendSeq: 5,
          sentAt: new Date(NOW.getTime() - 3_601_000),
        }),
      );

      // when
      const view = await service.sendCode(USER_ID, EMAIL, NOW);

      // then
      expect(view.sendCountUsed).toBe(1);
    });

    it('최근 1시간 계정 발송 합계가 20회에 도달했으면 일반 오류로 거절한다', async () => {
      // given — 주소를 갈아 끼워도 계정 합산에 걸린다 (auth.md 4.5 백스톱).
      // 두 창 모두 20건 — 24시간 상한(50)에는 여유가 있어도 1시간 상한(20)에 걸린다
      repository.countByUserIdSince.mockResolvedValue(20);

      // when
      const sending = service.sendCode(USER_ID, 'another@example.com', NOW);

      // then — 전용 코드·해제 시각 없이 일반 429로만 거절한다 (클라이언트 비노출)
      await expect(sending).rejects.toMatchObject({
        errorCode: ErrorCode.TOO_MANY_REQUESTS,
        retryAfterSec: undefined,
      });
      expect(mailClient.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('최근 24시간 계정 발송 합계가 50회에 도달했으면 일반 오류로 거절한다', async () => {
      // given — 1시간 창은 여유가 있어도 24시간 총량에 걸린다
      repository.countByUserIdSince.mockImplementation((_userId, since) =>
        Promise.resolve(
          since.getTime() === NOW.getTime() - 86_400_000 ? 50 : 3,
        ),
      );

      // when
      const sending = service.sendCode(USER_ID, EMAIL, NOW);

      // then
      await expect(sending).rejects.toMatchObject({
        errorCode: ErrorCode.TOO_MANY_REQUESTS,
      });
      expect(mailClient.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('계정 발송 합계가 상한 미만이면 정상 발송한다', async () => {
      // given
      repository.countByUserIdSince.mockImplementation((_userId, since) =>
        Promise.resolve(
          since.getTime() === NOW.getTime() - 3_600_000 ? 19 : 49,
        ),
      );
      repository.findLatestByUserIdAndEmailForUpdate.mockResolvedValue(null);

      // when
      const view = await service.sendCode(USER_ID, EMAIL, NOW);

      // then
      expect(view.sendCountUsed).toBe(1);
      expect(mailClient.sendVerificationCode).toHaveBeenCalledTimes(1);
    });

    it('이미 인증까지 끝난 같은 주소면 코드를 보내지 않는다', async () => {
      // given
      userService.getById.mockResolvedValue({
        id: USER_ID,
        email: EMAIL,
        isEmailVerified: true,
      } as User);

      // when
      const sending = service.sendCode(USER_ID, EMAIL, NOW);

      // then
      await expect(sending).rejects.toMatchObject({
        errorCode: ErrorCode.EMAIL_ALREADY_REGISTERED,
      });
      expect(mailClient.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('저장된 주소가 미인증이면 그 주소로도 코드를 보낸다', async () => {
      // given
      userService.getById.mockResolvedValue({
        id: USER_ID,
        email: EMAIL,
        isEmailVerified: false,
      } as User);
      repository.findLatestByUserIdAndEmailForUpdate.mockResolvedValue(null);

      // when
      const view = await service.sendCode(USER_ID, EMAIL, NOW);

      // then
      expect(view.sendCountUsed).toBe(1);
    });

    it('메일 발송에 실패하면 인증 행을 남기지 않는다', async () => {
      // given
      repository.findLatestByUserIdAndEmailForUpdate.mockResolvedValue(null);
      repository.saveIfNoActive.mockResolvedValue(
        buildVerification({ id: '42' }),
      );
      mailClient.sendVerificationCode.mockRejectedValue(new Error('smtp down'));

      // when
      const sending = service.sendCode(USER_ID, EMAIL, NOW);

      // then
      await expect(sending).rejects.toMatchObject({
        errorCode: ErrorCode.EMAIL_SEND_FAILED,
      });
      expect(repository.deleteById).toHaveBeenCalledWith('42');
    });

    it('동시 요청으로 활성 인증이 이미 있으면 쿨다운으로 흡수한다', async () => {
      // given
      repository.findLatestByUserIdAndEmailForUpdate.mockResolvedValue(null);
      repository.saveIfNoActive.mockResolvedValue(null);

      // when
      const sending = service.sendCode(USER_ID, EMAIL, NOW);

      // then
      await expect(sending).rejects.toMatchObject({
        errorCode: ErrorCode.EMAIL_VERIFICATION_RESEND_COOLDOWN,
      });
      expect(mailClient.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('형식이 잘못된 주소는 발송 전에 거절한다', async () => {
      // given
      const invalidEmail = 'not-an-email';

      // when
      const sending = service.sendCode(USER_ID, invalidEmail, NOW);

      // then
      await expect(sending).rejects.toMatchObject({
        errorCode: ErrorCode.EMAIL_FORMAT_INVALID,
      });
    });
  });

  describe('verifyCode', () => {
    it('코드가 일치하면 이메일과 인증 상태를 함께 저장한다', async () => {
      // given
      repository.findByIdAndUserId.mockResolvedValue(buildVerification());

      // when
      const result = await service.verifyCode(USER_ID, '1', '482913', NOW);

      // then
      expect(result.email).toBe(EMAIL);
      expect(userService.updateVerifiedEmail).toHaveBeenCalledWith(
        USER_ID,
        EMAIL,
        {},
      );
    });

    it('코드가 틀리면 남은 시도 횟수를 함께 내려준다', async () => {
      // given
      repository.findByIdAndUserId.mockResolvedValue(
        buildVerification({ attemptCount: 1 }),
      );

      // when
      const verifying = service.verifyCode(USER_ID, '1', '000000', NOW);

      // then
      await expect(verifying).rejects.toMatchObject({
        errorCode: ErrorCode.EMAIL_VERIFICATION_CODE_MISMATCH,
        details: { attempts_remaining: 3 },
      });
    });

    it('유효 시간이 지난 코드는 만료로 처리한다', async () => {
      // given
      repository.findByIdAndUserId.mockResolvedValue(
        buildVerification({ expiresAt: new Date(NOW.getTime() - 1000) }),
      );

      // when
      const verifying = service.verifyCode(USER_ID, '1', '482913', NOW);

      // then
      await expect(verifying).rejects.toMatchObject({
        errorCode: ErrorCode.EMAIL_VERIFICATION_CODE_EXPIRED,
      });
    });

    it('마지막 시도까지 틀리면 코드를 무효화한다', async () => {
      // given
      const verification = buildVerification({ attemptCount: 4 });
      repository.findByIdAndUserId.mockResolvedValue(verification);

      // when
      const verifying = service.verifyCode(USER_ID, '1', '000000', NOW);

      // then
      await expect(verifying).rejects.toMatchObject({
        errorCode: ErrorCode.EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED,
      });
      expect(verification.invalidatedAt).toEqual(NOW);
    });

    it('무효화된 건은 찾을 수 없는 것으로 처리한다', async () => {
      // given
      repository.findByIdAndUserId.mockResolvedValue(
        buildVerification({ invalidatedAt: NOW }),
      );

      // when
      const verifying = service.verifyCode(USER_ID, '1', '482913', NOW);

      // then
      await expect(verifying).rejects.toBeInstanceOf(BusinessException);
      await expect(verifying).rejects.toMatchObject({
        errorCode: ErrorCode.EMAIL_VERIFICATION_NOT_FOUND,
      });
    });
  });
});
