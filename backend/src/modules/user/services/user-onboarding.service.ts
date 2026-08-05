import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { UserService } from './user.service';
import { User } from '../entities/user.entity';
import { ONBOARDING_STEP_ORDER } from '../user.constant';
import { OnboardingStep } from '../user.enum';
import { UpdateCareerCommand } from '../user.types';
import { UserRepository } from '../repositories/user.repository';

/**
 * `users`의 **온보딩 상태·커리어 필드**를 소유한다(domain.md 3.1 — 커리어는 별도 테이블이
 * 아니라 `users`에 병합돼 있다, C-2).
 *
 * 계정 생명주기(가입·이메일·탈퇴)를 다루는 `UserService`와 분리한 이유는 유스케이스가
 * 다르기 때문이다(convention.md 2.1 — Service가 커지면 유스케이스 단위로 분리).
 */
@Injectable()
export class UserOnboardingService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userService: UserService,
  ) {}

  async getUser(userId: string, manager?: EntityManager): Promise<User> {
    return this.userService.getById(userId, manager);
  }

  /**
   * 온보딩이 끝난 계정의 온보딩 API 호출을 막는다.
   *
   * 완료 이후의 관심사·커리어 변경은 `interest-management` · `profile` 소관이다.
   * 온보딩 엔드포인트가 이를 받아주면 완료 이후에도 `onboarding_step`이 움직이는 경로가 생긴다.
   */
  assertNotCompleted(user: User): void {
    if (user.onboardingCompleted) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.ONBOARDING_ALREADY_COMPLETED,
        message: '이미 온보딩을 마쳤어요',
      });
    }
  }

  assertCompleted(user: User): void {
    if (!user.onboardingCompleted) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.ONBOARDING_NOT_COMPLETED,
        message: '온보딩을 먼저 완료해주세요',
      });
    }
  }

  /**
   * **`onboarding_step`은 앞으로만 전진한다**(onboarding-api.md 4.1).
   * 뒤로가기로 이전 단계를 다시 저장해도 재개 지점을 되돌리지 않는다 — 되돌리면 그 시점에
   * 앱이 죽었을 때 이미 끝낸 입력을 다시 시키게 된다.
   */
  async advanceStep(
    user: User,
    step: OnboardingStep,
    manager?: EntityManager,
  ): Promise<User> {
    if (
      ONBOARDING_STEP_ORDER[step] > ONBOARDING_STEP_ORDER[user.onboardingStep]
    ) {
      user.onboardingStep = step;
      return this.userRepository.save(user, manager);
    }

    return user;
  }

  /** 본문에 없는 필드는 건드리지 않고, `null`을 보낸 필드는 비운다 */
  async updateCareer(
    user: User,
    command: UpdateCareerCommand,
    manager?: EntityManager,
  ): Promise<User> {
    if ('jobCategory' in command) {
      user.jobCategory = command.jobCategory ?? null;
    }
    if ('jobTitle' in command) {
      user.jobTitle = command.jobTitle ?? null;
    }
    if ('yearsOfExperience' in command) {
      user.yearsOfExperience = command.yearsOfExperience ?? null;
    }

    return this.userRepository.save(user, manager);
  }

  /**
   * onboarding-api.md 4.7 — 완료 처리.
   * **드립 실패를 이유로 되돌리지 않는다.** 롤백하면 사용자가 온보딩을 처음부터 다시 하게
   * 되고, 원인인 편성 장애는 재시도해도 그대로다.
   */
  async complete(
    user: User,
    now: Date,
    manager?: EntityManager,
  ): Promise<User> {
    user.onboardingCompleted = true;
    user.onboardingStep = OnboardingStep.DONE;
    user.onboardingCompletedAt = now;

    return this.userRepository.save(user, manager);
  }
}
