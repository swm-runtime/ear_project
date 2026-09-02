/**
 * 인증 API mock — 백엔드 없이 A1(시작)→A3(약관)→가입→온보딩 진입까지 로그인 흐름을
 * 테스트하는 서버 대역이다. 다른 mock과 같은 관례로 api 모듈 진입점에서 구현체만
 * 갈아끼운다(DTO를 반환한다).
 *
 * 층 구분: 이 mock은 **우리 서버**(auth-api.md 4.1~4.4) 대역이다. **제공자 SDK** 대역은
 * `services/provider-auth.service.ts`의 mock 분기(IS_PROVIDER_AUTH_MOCKED)가 따로 맡는다.
 * 둘 다 mock이면 실제 소셜 계정 없이 로그인 동작 전체를 넘어갈 수 있다.
 *
 * 시나리오 전환(EXPO_PUBLIC_AUTH_MOCK_SCENARIO):
 * - (기본)     신규 사용자 — social-login이 consent_required → 약관 동의 → sign-up이
 *              onboarding_step "topic" 세션 반환(auth-api.md 4.2) → 온보딩 진입
 * - returning  기존 사용자 — social-login이 바로 authenticated(온보딩 완료) → 라이브러리
 */
import type {
  AuthSessionDto,
  ConsentItemDto,
  RefreshTokenResponseDto,
  SocialLoginRequestDto,
  SocialLoginResponseDto,
  UserDto,
} from './auth.api';
import type { SocialProvider } from '../auth.types';

const SCENARIO = process.env.EXPO_PUBLIC_AUTH_MOCK_SCENARIO ?? 'default';

/** 스켈레톤 0.3초 규칙(useDelayedVisible)이 실제로 노출되는 지연 — 다른 mock과 동일 값 */
const RESPONSE_DELAY_MS = 600;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 현행 동의 항목 — 버전은 서버가 내려주는 값이라는 계약(auth-api.md 4.1)만 흉내 낸다 */
const REQUIRED_CONSENTS: ConsentItemDto[] = [
  { consent_type: 'terms', version: '1.0', is_required: true },
  { consent_type: 'privacy', version: '1.0', is_required: true },
  { consent_type: 'marketing', version: '1.0', is_required: false },
];

const ACCESS_TOKEN_TTL_MS = 30 * 60_000;
const SIGNUP_TOKEN_TTL_MS = 10 * 60_000;

let tokenSeq = 0;
/** social-login에서 받은 제공자를 sign-up 응답의 user.provider로 되돌려준다 */
let pendingProvider: SocialProvider = 'kakao';

const issueTokens = (nowMs: number) => {
  tokenSeq += 1;
  return {
    access_token: `mock-access-token-${tokenSeq}`,
    refresh_token: `mock-refresh-token-${tokenSeq}`,
    access_token_expires_at: new Date(nowMs + ACCESS_TOKEN_TTL_MS).toISOString(),
  };
};

const buildUser = (provider: SocialProvider, onboardingCompleted: boolean): UserDto => ({
  id: 'mock-user-1',
  // 닉네임은 온보딩 전 null이다(auth-api.md 4.1)
  nickname: onboardingCompleted ? '이어테스터' : null,
  email: 'user@example.com',
  is_email_verified: true,
  provider,
  tier: 'free',
  role: 'user',
  onboarding_completed: onboardingCompleted,
  onboarding_step: onboardingCompleted ? 'done' : 'topic',
});

export const mockSocialLogin = async (
  body: SocialLoginRequestDto,
): Promise<SocialLoginResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const nowMs = Date.now();
  pendingProvider = body.provider;

  // 기존 사용자 — 바로 세션이 열린다(auth-api.md 4.1 authenticated)
  if (SCENARIO === 'returning') {
    return {
      status: 'authenticated',
      ...issueTokens(nowMs),
      pending_consents: [],
      user: buildUser(body.provider, true),
    };
  }

  // 신규 사용자 — 약관 동의(A3)를 거쳐야 계정이 생긴다(auth-api.md 4.1 consent_required)
  return {
    status: 'consent_required',
    signup_token: `mock-signup-token-${nowMs}`,
    signup_token_expires_at: new Date(nowMs + SIGNUP_TOKEN_TTL_MS).toISOString(),
    required_consents: REQUIRED_CONSENTS,
  };
};

export const mockSignUp = async (): Promise<AuthSessionDto> => {
  await delay(RESPONSE_DELAY_MS);
  // 가입 직후는 온보딩 전 상태다 — onboarding_step "topic"(auth-api.md 4.2)
  return {
    status: 'authenticated',
    ...issueTokens(Date.now()),
    pending_consents: [],
    user: buildUser(pendingProvider, false),
  };
};

export const mockRefreshSession = async (): Promise<RefreshTokenResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  // 회전(rotation) 계약만 흉내 낸다 — 매번 새 토큰 쌍을 돌려준다(auth-api.md 4.3)
  return issueTokens(Date.now());
};

export const mockRequestLogout = async (): Promise<void> => {
  await delay(RESPONSE_DELAY_MS);
};
