import { User } from '@/modules/user/entities/user.entity';
import { resolveEffectiveTier } from '@/modules/user/policies/effective-tier.policy';
import {
  OnboardingStep,
  SocialProvider,
  UserMarket,
  UserRole,
  UserTier,
} from '@/modules/user/user.enum';

/**
 * 인증 응답의 `user` 객체.
 * Entity를 그대로 반환하지 않는다 — 내부 컬럼이 유출된다 (convention.md 3.2).
 */
export class AuthUserDto {
  readonly id: string;
  /** 온보딩 전에는 null일 수 있다 (domain.md 3.1) */
  readonly nickname: string | null;
  /** 제공자 프로필 사진 URL — 로그인 시점의 최신값 (domain.md 3.1) */
  readonly profile_image_url: string | null;
  readonly email: string | null;
  /** `users` 컬럼 값이며 제공자 응답을 중계한 값이 아니다 (auth-api.md 4.1) */
  readonly is_email_verified: boolean;
  readonly provider: SocialProvider;
  /**
   * 유효 티어 — 저장된 `users.tier`가 아니다. 무료 사용자가 가입 체험 중이면 `trial`이다
   * (`subscription.md` 4.8). 체험의 종료일·이후 한도는 플랜 요약(`plan.trial`)이 싣는다
   */
  readonly tier: UserTier;
  readonly role: UserRole;
  readonly onboarding_completed: boolean;
  readonly onboarding_step: OnboardingStep;
  /** 시장(`global-api.md` 4.1) — 제공자 목록·온보딩 단계·요금제 분기의 기준. 클라이언트는 언어로 추측하지 않는다 */
  readonly market: UserMarket;
  /** 저장된 기기 언어(BCP 47). 구 앱은 null */
  readonly language_code: string | null;
  /** 저장된 기기 시간대(IANA). 구 앱은 null */
  readonly timezone: string | null;

  /** `now`는 가입 체험 판정용 — `tier`는 그 시각의 유효 티어다(`resolveEffectiveTier`) */
  static from(user: User, now: Date): AuthUserDto {
    return {
      id: user.id,
      nickname: user.nickname,
      profile_image_url: user.profileImageUrl,
      email: user.email,
      is_email_verified: user.isEmailVerified,
      provider: user.provider,
      tier: resolveEffectiveTier(user, now),
      role: user.role,
      onboarding_completed: user.onboardingCompleted,
      onboarding_step: user.onboardingStep,
      market: user.market,
      language_code: user.languageCode,
      timezone: user.timezone,
    };
  }
}
