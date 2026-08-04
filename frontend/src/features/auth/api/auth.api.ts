import { apiClient } from '@/shared/api/api-client';
import { generateId } from '@/shared/lib/generate-id';

import type {
  AuthSession,
  AuthTokens,
  AuthUser,
  ConsentSubmission,
  ConsentType,
  RequiredConsent,
  SocialLoginResult,
  SocialProvider,
} from '../auth.types';

/* ── DTO — auth-api.md 계약 그대로 snake_case로 선언한다(convention.md 1.6) ── */

interface SocialLoginRequestDto {
  provider: SocialProvider;
  provider_token: string;
  device_id: string;
}

interface ConsentItemDto {
  consent_type: ConsentType;
  version: string | null;
  is_required: boolean;
}

interface UserDto {
  id: string;
  nickname: string;
  email: string | null;
  is_email_verified: boolean;
  provider: SocialProvider;
  tier: string;
  role: string;
  onboarding_completed: boolean;
  onboarding_step: string;
}

/** auth-api.md 4.2 — sign-up 응답은 social-login의 authenticated 응답과 같은 형태다 */
interface AuthSessionDto {
  status: 'authenticated';
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  pending_consents: ConsentItemDto[];
  user: UserDto;
}

interface SocialLoginConsentRequiredDto {
  status: 'consent_required';
  signup_token: string;
  signup_token_expires_at: string;
  required_consents: ConsentItemDto[];
}

type SocialLoginResponseDto = AuthSessionDto | SocialLoginConsentRequiredDto;

interface ConsentSubmissionDto {
  consent_type: ConsentType;
  version: string | null;
  is_agreed: boolean;
}

interface SignUpRequestDto {
  signup_token: string;
  device_id: string;
  consents: ConsentSubmissionDto[];
}

interface RefreshTokenRequestDto {
  refresh_token: string;
  device_id: string;
}

interface RefreshTokenResponseDto {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
}

interface LogoutRequestDto {
  device_id: string;
}

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toRequiredConsent = (dto: ConsentItemDto): RequiredConsent => ({
  consentType: dto.consent_type,
  version: dto.version,
  isRequired: dto.is_required,
});

const toAuthUser = (dto: UserDto): AuthUser => ({
  id: dto.id,
  nickname: dto.nickname,
  email: dto.email,
  isEmailVerified: dto.is_email_verified,
  provider: dto.provider,
  tier: dto.tier,
  role: dto.role,
  onboardingCompleted: dto.onboarding_completed,
  onboardingStep: dto.onboarding_step,
});

const toAuthSession = (dto: AuthSessionDto): AuthSession => ({
  tokens: {
    accessToken: dto.access_token,
    refreshToken: dto.refresh_token,
    accessTokenExpiresAt: dto.access_token_expires_at,
  },
  user: toAuthUser(dto.user),
  pendingConsents: dto.pending_consents.map(toRequiredConsent),
});

const toConsentSubmissionDto = (model: ConsentSubmission): ConsentSubmissionDto => ({
  consent_type: model.consentType,
  version: model.version,
  is_agreed: model.isAgreed,
});

/* ── 엔드포인트 ── */

export const socialLogin = async (input: {
  provider: SocialProvider;
  providerToken: string;
  deviceId: string;
}): Promise<SocialLoginResult> => {
  const body: SocialLoginRequestDto = {
    provider: input.provider,
    provider_token: input.providerToken,
    device_id: input.deviceId,
  };
  const { data } = await apiClient.post<SocialLoginResponseDto>('/auth/social-login', body, {
    skipAuthRefresh: true,
  });

  if (data.status === 'consent_required') {
    return {
      status: 'consent_required',
      signupToken: data.signup_token,
      signupTokenExpiresAt: data.signup_token_expires_at,
      requiredConsents: data.required_consents.map(toRequiredConsent),
    };
  }
  return { status: 'authenticated', ...toAuthSession(data) };
};

/** 약관 동의 → 계정 생성. 멱등키 필수(auth-api.md 3장 ★) */
export const signUp = async (input: {
  signupToken: string;
  deviceId: string;
  consents: ConsentSubmission[];
}): Promise<AuthSession> => {
  const body: SignUpRequestDto = {
    signup_token: input.signupToken,
    device_id: input.deviceId,
    consents: input.consents.map(toConsentSubmissionDto),
  };
  const { data } = await apiClient.post<AuthSessionDto>('/auth/sign-up', body, {
    skipAuthRefresh: true,
    idempotencyKey: generateId(),
  });
  return toAuthSession(data);
};

/** 토큰 갱신(회전). 401 갱신 플로우를 다시 타면 안 된다 */
export const refreshSession = async (input: {
  refreshToken: string;
  deviceId: string;
}): Promise<AuthTokens> => {
  const body: RefreshTokenRequestDto = {
    refresh_token: input.refreshToken,
    device_id: input.deviceId,
  };
  const { data } = await apiClient.post<RefreshTokenResponseDto>('/auth/token/refresh', body, {
    skipAuthRefresh: true,
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: data.access_token_expires_at,
  };
};

/** 이 기기 세션만 폐기한다. 호출 실패해도 클라이언트는 로그아웃을 진행한다(auth-api.md 4.4) */
export const requestLogout = async (input: { deviceId: string }): Promise<void> => {
  const body: LogoutRequestDto = { device_id: input.deviceId };
  await apiClient.post('/auth/logout', body, { noAutoRetry: true });
};
