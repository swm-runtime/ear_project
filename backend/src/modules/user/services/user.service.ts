import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { ConsentService } from './consent.service';
import { User } from '../entities/user.entity';
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
  constructor(
    private readonly userRepository: UserRepository,
    private readonly consentService: ConsentService,
    private readonly dataSource: DataSource,
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

  /** 파이프라인 SSO — 검증된 이메일과 같은 관리자 계정 (changes/pending/pipeline-sso-login.md) */
  async findAdminByEmail(email: string): Promise<User | null> {
    return this.userRepository.findAdminByEmail(email);
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

    return this.dataSource.transaction(async (manager) => {
      const user = this.userRepository.create({
        provider: command.provider,
        providerUserId: command.providerUserId,
        email: command.email,
        isEmailVerified: command.isEmailVerified,
        nickname: command.nickname,
        role: UserRole.USER,
        tier: UserTier.LIGHT,
        status: UserStatus.ACTIVE,
        onboardingCompleted: false,
        onboardingStep: OnboardingStep.TOPIC,
      });

      const saved = await this.userRepository.save(user, manager);
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

  async deleteById(userId: string, manager?: EntityManager): Promise<void> {
    await this.userRepository.deleteById(userId, manager);
  }

  /** 필수 2종이 동의되지 않으면 계정을 만들지 않는다 (auth-api.md 4.2) */
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
