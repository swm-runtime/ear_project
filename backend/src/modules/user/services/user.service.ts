import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { isUniqueViolation } from '@/common/utils/unique-violation.util';
import { EnvironmentVariables } from '@/config/env.validation';

import { ConsentService } from './consent.service';
import { User } from '../entities/user.entity';
import {
  resolveExistingUserTrialEndsAtFor,
  resolveSignupTrialEndsAtFor,
} from '../policies/signup-trial.policy';
import {
  REQUIRED_CONSENT_TYPES,
  CURRENT_CONSENT_VERSIONS,
} from '../user.constant';
import {
  OnboardingStep,
  SocialProvider,
  UserRole,
  UserStatus,
  UserTier,
} from '../user.enum';
import { UserRepository } from '../repositories/user.repository';
import { CreateUserCommand } from '../user.types';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly consentService: ConsentService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async findByProvider(
    provider: SocialProvider,
    providerUserId: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    return this.userRepository.findByProviderAndProviderUserId(
      provider,
      providerUserId,
      manager,
    );
  }

  /** 편성 배치 대상(온보딩 완료자) 한 페이지 — `id` keyset 순회 */
  async findDripTargetsPage(
    afterId: string | null,
    limit: number,
    manager?: EntityManager,
  ): Promise<User[]> {
    return this.userRepository.findDripTargetsPage(afterId, limit, manager);
  }

  /** 편성 미리보기(admin) — 이메일로 대상 사용자 한 명. 역할 무관, 없으면 null */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  /** 파이프라인 SSO — 검증된 이메일과 같은 관리자 계정 (changes/pending/pipeline-sso-login.md) */
  async findAdminByEmail(email: string): Promise<User | null> {
    return this.userRepository.findAdminByEmail(email);
  }

  /**
   * 같은 사용자의 동시 요청을 직렬화해야 할 때 쓴다 — 트랜잭션 필수.
   * 재생 한도 차감(`paywall.md` 4.1)과 탈퇴 아카이브 판정이 이 경로다.
   */
  async getByIdForUpdate(id: string, manager: EntityManager): Promise<User> {
    const user = await this.userRepository.findByIdForUpdate(id, manager);

    if (!user) {
      throw new BusinessNotFoundException({
        errorCode: ErrorCode.NOT_FOUND,
        message: '찾을 수 없어요',
      });
    }

    return user;
  }

  async getById(id: string, manager?: EntityManager): Promise<User> {
    const user = await this.userRepository.findById(id, manager);

    if (!user) {
      throw new BusinessNotFoundException({
        errorCode: ErrorCode.NOT_FOUND,
        message: '찾을 수 없어요',
      });
    }

    return user;
  }

  /**
   * auth.md 4.1 — **동의 버튼을 누른 시점에 계정이 생성된다.**
   * 계정과 동의 이력을 하나의 트랜잭션에서 만든다 — 동의 없는 계정이 남으면 안 된다.
   */
  async createUser(command: CreateUserCommand, now: Date): Promise<User> {
    this.assertRequiredConsents(command);

    try {
      return await this.insertUser(command, now);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      /**
       * **동시에 도착한 가입 요청 중 하나가 먼저 만들었다.**
       * `uq_users_provider_provider_user_id`가 중복 계정을 막았으므로 그 계정을 돌려준다 —
       * 순차 재시도가 `findByProvider`에서 걸리는 것과 같은 결과다(`auth.service.ts` signUp).
       *
       * 흡수하지 않으면 500 `INTERNAL_ERROR`(retryable: true)가 나가고, 클라이언트가 같은
       * 요청을 자동 재시도한다(architecture.md 8.4 — 유니크 위반은 도메인 흐름으로 흡수한다).
       * 트랜잭션이 이미 중단됐으므로 조회는 **밖에서** 한다.
       */
      const existing = await this.findByProvider(
        command.provider,
        command.providerUserId,
      );

      if (!existing) {
        // 다른 유니크 제약이 걸린 것이다 — 삼키면 원인을 잃는다
        throw error;
      }

      this.logger.warn('concurrent sign-up absorbed by unique constraint', {
        user_id: existing.id,
        provider: command.provider,
      });

      return existing;
    }
  }

  private async insertUser(
    command: CreateUserCommand,
    now: Date,
  ): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = this.userRepository.create({
        provider: command.provider,
        providerUserId: command.providerUserId,
        email: command.email,
        isEmailVerified: command.isEmailVerified,
        nickname: command.nickname,
        profileImageUrl: command.profileImageUrl,
        role: UserRole.USER,
        tier: UserTier.LIGHT,
        // 가입 체험(subscription.md 4.8) — 스위치가 켜져 있을 때만. `tier`는 건드리지 않는다(결제가 쓰는 캐시)
        trialEndsAt: resolveSignupTrialEndsAtFor(this.configService, now),
        status: UserStatus.ACTIVE,
        onboardingCompleted: false,
        onboardingStep: OnboardingStep.TOPIC,
      });

      const saved = await this.userRepository.save(user, manager);

      if (saved.trialEndsAt !== null) {
        this.logger.log('signup trial granted', {
          user_id: saved.id,
          trial_ends_at: saved.trialEndsAt.toISOString(),
          source: 'signup',
        });
      }

      await this.consentService.recordConsents(
        saved.id,
        command.consents,
        now,
        manager,
      );

      return saved;
    });
  }

  /**
   * auth-api.md 4.10 — 코드 검증에 성공한 **서버가** email과 is_email_verified를 함께 저장한다.
   * 두 컬럼을 같은 트랜잭션에서 쓰지 않으면 미인증 주소가 인증된 것으로 둔갑한다.
   */
  async updateVerifiedEmail(
    userId: string,
    email: string,
    manager?: EntityManager,
  ): Promise<User> {
    const user = await this.getById(userId, manager);

    user.email = email;
    user.isEmailVerified = true;

    return this.userRepository.save(user, manager);
  }

  /**
   * `users.tier` 캐시를 맞춘다(domain.md 3.1). **티어의 진실의 원천은 `subscriptions`다** — 이 값은
   * 재생 한도 판정이 매 요청 조인 없이 읽으려는 사본이다.
   *
   * **부르는 곳은 결제 반영 한 곳이다**(`BillingSyncService.syncUserTier`). 다른 경로가 이 값을 쓰기
   * 시작하면 캐시가 `subscriptions`와 어긋나도 어디서 틀어졌는지 찾을 수 없다. 반드시 구독 행을 고친
   * 그 트랜잭션 안에서 부른다 — 따로 쓰면 "결제는 반영됐는데 한도는 무료"인 순간이 생긴다.
   *
   * 같은 값이면 쓰지 않는다. 바뀌었는지를 돌려준다.
   */
  async updateTier(
    userId: string,
    tier: UserTier,
    manager: EntityManager,
  ): Promise<boolean> {
    const user = await this.getByIdForUpdate(userId, manager);

    if (user.tier === tier) {
      return false;
    }

    user.tier = tier;
    await this.userRepository.save(user, manager);

    return true;
  }

  /**
   * 로그인마다 제공자 프로필 사진 URL을 최신값으로 맞춘다 (auth.md 4.1).
   * 제공자 CDN 주소는 사용자가 사진을 바꾸면 죽으므로 저장값을 오래 믿지 않는다.
   * 같은 값이면 쓰지 않는다 — 로그인마다 `users` 행을 갱신할 이유가 없다.
   */
  async syncProfileImageUrl(
    user: User,
    profileImageUrl: string | null,
  ): Promise<User> {
    if (user.profileImageUrl === profileImageUrl) {
      return user;
    }

    user.profileImageUrl = profileImageUrl;

    return this.userRepository.save(user);
  }

  /**
   * 체험이 생기기 전에 가입한 계정에 체험을 한 번 준다(`subscription.md` 4.8 "기존 가입자").
   * **앱이 세션을 여는 두 지점**(세션 복원 `GET /users/me` · 기존 계정 로그인)에서 부른다 — 대상이 아니면
   * 아무것도 쓰지 않고 받은 사용자를 그대로 돌려준다(체험을 이미 받은 계정은 DB에 가지 않는다).
   *
   * **실패해도 던지지 않는다.** 이 메서드는 앱 시작 경로에 있다 — 프로모션 지급이 실패했다고 로그인·세션
   * 복원이 막히면 안 된다. 적지 못한 계정은 다음에 앱을 열 때 다시 시도된다.
   */
  async grantExistingUserTrial(user: User, now: Date): Promise<User> {
    const trialEndsAt = resolveExistingUserTrialEndsAtFor(
      this.configService,
      user,
      now,
    );

    if (trialEndsAt === null) {
      return user;
    }

    try {
      const granted = await this.userRepository.setTrialEndsAtIfAbsent(
        user.id,
        trialEndsAt,
      );

      if (!granted) {
        // 동시에 도착한 다른 요청이 먼저 적었다 — 그쪽이 적은 값이 약속이다
        return (await this.userRepository.findById(user.id)) ?? user;
      }

      user.trialEndsAt = trialEndsAt;
      this.logger.log('signup trial granted', {
        user_id: user.id,
        trial_ends_at: trialEndsAt.toISOString(),
        source: 'existing_user',
      });
    } catch (error) {
      this.logger.error(
        'failed to grant signup trial to existing user',
        error instanceof Error ? error.stack : String(error),
        { user_id: user.id },
      );
    }

    return user;
  }

  async deleteById(userId: string, manager?: EntityManager): Promise<void> {
    await this.userRepository.deleteById(userId, manager);
  }

  /** 필수 동의(약관·개인정보·연령 확인)가 빠지면 계정을 만들지 않는다 (auth-api.md 4.2) */
  private assertRequiredConsents(command: CreateUserCommand): void {
    const agreedTypes = new Set(
      command.consents
        .filter((consent) => consent.isAgreed)
        .map((c) => c.consentType),
    );

    const missing = REQUIRED_CONSENT_TYPES.filter(
      (type) => !agreedTypes.has(type),
    );
    if (missing.length > 0) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.CONSENT_REQUIRED,
        message: '필수 약관에 동의해야 시작할 수 있어요',
      });
    }

    // 동의 화면 체류 중 약관이 개정된 경우 — 최신 버전으로 다시 받는다
    const stale = command.consents.some(
      (consent) =>
        consent.version !== CURRENT_CONSENT_VERSIONS[consent.consentType],
    );
    if (stale) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.CONSENT_VERSION_STALE,
        message: '약관이 변경되었어요. 다시 확인해주세요',
      });
    }
  }
}
