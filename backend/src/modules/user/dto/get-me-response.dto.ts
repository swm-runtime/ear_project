import { User } from '../entities/user.entity';
import {
  ConsentType,
  OnboardingStep,
  SocialProvider,
  UserRole,
  UserTier,
} from '../user.enum';
import { PendingConsent } from '../user.types';

/**
 * 세션 복원(`GET /users/me` — `tickets/backend/pending/session-restore-endpoint.md`).
 *
 * **`user`는 `POST /auth/social-login`(auth-api.md 4.1) 응답의 `user` 객체와 필드 구성이
 * 같아야 한다** — 모양이 갈리면 로그인 경로와 복원 경로가 서로 다른 판정을 하게 된다.
 * auth 모듈의 `AuthUserDto`를 직접 import하지 않는 이유는 모듈 내부 파일 참조 금지
 * (convention.md 2.3)와 `user → auth` 역방향 의존 금지(architecture.md 4.3)다. 대신
 * `get-me-response.dto.spec.ts`가 두 DTO의 필드 집합 일치를 검사해 드리프트를 막는다.
 *
 * `pending_consents`도 4.1과 같은 모양으로 함께 내려준다 — 이미 로그인된 세션으로 앱을
 * 다시 열 때 재동의 화면(A20) 판정을 한 번의 왕복으로 끝내기 위해서다(티켓 요청 3).
 */
class MeUserDto {
  readonly id: string;
  readonly nickname: string | null;
  readonly email: string | null;
  readonly is_email_verified: boolean;
  readonly provider: SocialProvider;
  readonly tier: UserTier;
  readonly role: UserRole;
  readonly onboarding_completed: boolean;
  readonly onboarding_step: OnboardingStep;
}

class MePendingConsentDto {
  readonly consent_type: ConsentType;
  readonly version: string | null;
  readonly is_required: boolean;
}

export class GetMeResponseDto {
  readonly user: MeUserDto;
  readonly pending_consents: MePendingConsentDto[];

  static from(user: User, pendingConsents: PendingConsent[]): GetMeResponseDto {
    return {
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        is_email_verified: user.isEmailVerified,
        provider: user.provider,
        tier: user.tier,
        role: user.role,
        onboarding_completed: user.onboardingCompleted,
        onboarding_step: user.onboardingStep,
      },
      pending_consents: pendingConsents.map((consent) => ({
        consent_type: consent.consentType,
        version: consent.version,
        is_required: consent.isRequired,
      })),
    };
  }
}
