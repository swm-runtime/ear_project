import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { EnvironmentVariables } from '@/config/env.validation';

import { ConsentService } from './consent.service';
import { User } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';
import { UserService } from './user.service';
import { ConsentType, SocialProvider } from '../user.enum';
import { ConsentInput, CreateUserCommand } from '../user.types';

const NOW = new Date('2026-09-06T09:00:00.000Z');

/** 가입 체험 스위치(`SIGNUP_TRIAL_*`)만 읽는 ConfigService 대역 — 기본은 꺼짐 */
function buildConfigService(
  env: Partial<
    Record<'SIGNUP_TRIAL_ENABLED' | 'SIGNUP_TRIAL_DAYS', string>
  > = {},
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: 'SIGNUP_TRIAL_ENABLED' | 'SIGNUP_TRIAL_DAYS') => env[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

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
    profileImageUrl: null,
    consents,
  };
}

describe('UserService.createUser — 필수 동의 판정', () => {
  let service: UserService;
  let userRepository: jest.Mocked<UserRepository>;
  let consentService: jest.Mocked<ConsentService>;
  let dataSource: DataSource;

  beforeEach(() => {
    userRepository = {
      create: jest.fn((input) => input as User),
      save: jest.fn((user) => Promise.resolve({ ...user, id: 'user-1' })),
    } as unknown as jest.Mocked<UserRepository>;
    consentService = {
      recordConsents: jest.fn(() => Promise.resolve([])),
    } as unknown as jest.Mocked<ConsentService>;
    dataSource = {
      transaction: jest.fn((run: (manager: EntityManager) => unknown) =>
        run({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new UserService(
      userRepository,
      consentService,
      dataSource,
      buildConfigService(),
    );
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

  describe('가입 체험(subscription.md 4.8)', () => {
    const createWith = async (
      env: Partial<
        Record<'SIGNUP_TRIAL_ENABLED' | 'SIGNUP_TRIAL_DAYS', string>
      >,
    ): Promise<User> =>
      new UserService(
        userRepository,
        consentService,
        dataSource,
        buildConfigService(env),
      ).createUser(buildCommand(buildConsents()), NOW);

    it('스위치가 켜져 있으면 가입한 서비스 날짜부터 7일째가 끝나는 04:00 KST까지 체험을 준다', async () => {
      // given — NOW는 9월 6일 18:00 KST
      // when
      const user = await createWith({ SIGNUP_TRIAL_ENABLED: 'true' });

      // then — 9월 6일~12일이 체험, 9월 13일 04:00 KST에 끝난다
      expect(user.trialEndsAt?.toISOString()).toBe('2026-09-12T19:00:00.000Z');
    });

    it('체험은 trial_ends_at에만 적고 tier는 light 그대로 둔다 — tier는 결제가 쓰는 캐시다', async () => {
      const user = await createWith({ SIGNUP_TRIAL_ENABLED: 'true' });

      expect(user.tier).toBe('light');
    });

    it('스위치가 꺼져 있으면 체험을 주지 않는다', async () => {
      const off = await createWith({ SIGNUP_TRIAL_ENABLED: 'false' });
      const unset = await createWith({});
      const blank = await createWith({ SIGNUP_TRIAL_ENABLED: '' });

      expect(off.trialEndsAt).toBeNull();
      expect(unset.trialEndsAt).toBeNull();
      expect(blank.trialEndsAt).toBeNull();
    });

    it('일수를 지정하면 그만큼 준다', async () => {
      const user = await createWith({
        SIGNUP_TRIAL_ENABLED: 'true',
        SIGNUP_TRIAL_DAYS: '3',
      });

      // 9월 6일~8일, 9월 9일 04:00 KST 종료
      expect(user.trialEndsAt?.toISOString()).toBe('2026-09-08T19:00:00.000Z');
    });

    it('일수가 비어 있으면 7일이다 — 배포 스크립트가 선택 키를 빈 값으로 선언해 둔다', async () => {
      const user = await createWith({
        SIGNUP_TRIAL_ENABLED: 'true',
        SIGNUP_TRIAL_DAYS: '',
      });

      expect(user.trialEndsAt?.toISOString()).toBe('2026-09-12T19:00:00.000Z');
    });
  });
});
