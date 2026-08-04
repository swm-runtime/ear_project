import { User } from '@/modules/user/entities/user.entity';
import {
  OnboardingStep,
  SocialProvider,
  UserRole,
  UserTier,
} from '@/modules/user/user.enum';

/**
 * 인증 응답의 `user` 객체.
 * Entity를 그대로 반환하지 않는다 — 내부 컬럼이 유출된다 (convention.md 3.2).
 */
export class AuthUserDto {
  readonly id: string;
  readonly nickname: string;
  readonly email: string | null;
  /** `users` 컬럼 값이며 제공자 응답을 중계한 값이 아니다 (auth-api.md 4.1) */
  readonly is_email_verified: boolean;
  readonly provider: SocialProvider;
  readonly tier: UserTier;
  readonly role: UserRole;
  readonly onboarding_completed: boolean;
  readonly onboarding_step: OnboardingStep;

  static from(user: User): AuthUserDto {
    return {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      is_email_verified: user.isEmailVerified,
      provider: user.provider,
      tier: user.tier,
      role: user.role,
      onboarding_completed: user.onboardingCompleted,
      onboarding_step: user.onboardingStep,
    };
  }
}
