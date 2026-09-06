import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { ConsentService } from './consent.service';
import { User } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';
import { UserService } from './user.service';
import { ConsentType, SocialProvider } from '../user.enum';
import { ConsentInput, CreateUserCommand } from '../user.types';

const NOW = new Date('2026-09-06T09:00:00.000Z');

/** 필수 3종 + 마케팅 거부 — 정상 가입 입력 (auth-api.md 4.2) */
function buildConsents(): ConsentInput[] {
  return [
    { consentType: ConsentType.TERMS, version: '0.1', isAgreed: true },
    { consentType: ConsentType.PRIVACY, version: '0.1', isAgreed: true },
    {
      consentType: ConsentType.AGE_CONFIRMATION,
      version: null,
      isAgreed: true,
    },
    { consentType: ConsentType.MARKETING, version: null, isAgreed: false },
  ];
}

function buildCommand(consents: ConsentInput[]): CreateUserCommand {
  return {
    provider: SocialProvider.KAKAO,
    providerUserId: 'kakao-1',
    email: 'user@example.com',
    isEmailVerified: false,
    nickname: null,
    consents,
  };
}

describe('UserService.createUser — 필수 동의 판정', () => {
  let service: UserService;
  let userRepository: jest.Mocked<UserRepository>;
  let consentService: jest.Mocked<ConsentService>;

  beforeEach(() => {
    userRepository = {
      create: jest.fn((input) => input as User),
      save: jest.fn((user) => Promise.resolve({ ...user, id: 'user-1' })),
    } as unknown as jest.Mocked<UserRepository>;
    consentService = {
      recordConsents: jest.fn(() => Promise.resolve([])),
    } as unknown as jest.Mocked<ConsentService>;
    const dataSource = {
      transaction: jest.fn((run: (manager: EntityManager) => unknown) =>
        run({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new UserService(userRepository, consentService, dataSource);
  });

  it('필수 3종(약관·개인정보·연령 확인)이 모두 동의되면 계정과 동의 이력을 만든다', async () => {
    const consents = buildConsents();

    await service.createUser(buildCommand(consents), NOW);

    expect(userRepository.save).toHaveBeenCalled();
    expect(consentService.recordConsents).toHaveBeenCalledWith(
      'user-1',
      consents,
      NOW,
      expect.anything(),
    );
  });

  it('연령 확인이 빠지면 CONSENT_REQUIRED로 거절하고 계정을 만들지 않는다', async () => {
    const consents = buildConsents().filter(
      (consent) => consent.consentType !== ConsentType.AGE_CONFIRMATION,
    );

    await expect(
      service.createUser(buildCommand(consents), NOW),
    ).rejects.toMatchObject<Partial<BusinessException>>({
      errorCode: ErrorCode.CONSENT_REQUIRED,
    });
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('연령 확인이 is_agreed: false로 오면 동의로 치지 않는다', async () => {
    const consents = buildConsents().map((consent) =>
      consent.consentType === ConsentType.AGE_CONFIRMATION
        ? { ...consent, isAgreed: false }
        : consent,
    );

    await expect(
      service.createUser(buildCommand(consents), NOW),
    ).rejects.toMatchObject<Partial<BusinessException>>({
      errorCode: ErrorCode.CONSENT_REQUIRED,
    });
  });

  it('약관 버전이 현행과 다르면 CONSENT_VERSION_STALE로 거절한다', async () => {
    const consents = buildConsents().map((consent) =>
      consent.consentType === ConsentType.TERMS
        ? { ...consent, version: '0.0' }
        : consent,
    );

    await expect(
      service.createUser(buildCommand(consents), NOW),
    ).rejects.toMatchObject<Partial<BusinessException>>({
      errorCode: ErrorCode.CONSENT_VERSION_STALE,
    });
  });

  it('연령 확인은 버전 없는 자기 선언이다 — version null이 현행 버전 판정을 통과한다', async () => {
    await expect(
      service.createUser(buildCommand(buildConsents()), NOW),
    ).resolves.toBeDefined();
  });
});
