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
 * - legacy-consents  신규 사용자 + 동의 목록 재조회(sign-up/consents)가 없는 구 서버 — 404 `NOT_FOUND` →
 *              A4가 로그인 응답의 목록으로 그려진다(폴백 확인용)
 *
 * 동의 목록 재조회(sign-up/consents, PM 2026-10-16 — BE 제안 계약): `preferred_language` `en`(GLOBAL)이면
 * 국외 이전 동의(`cross_border_transfer`)가 필수로 붙고, `ko`(KR)면 로그인 응답의 목록 그대로다(KAN-215).
 *
 * 시장(global-api.md 2.1): 가입은 `locale.preferred_language`(`en` → `global`)로, 그 밖은 마지막 가입의
 * 시장을 돌려준다(처음엔 `kr`). 기존 계정 로그인은 서버처럼 `locale`로 시장을 바꾸지 않는다.
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type {
  AuthSessionDto,
  ConsentItemDto,
  RefreshTokenResponseDto,
  SignUpConsentsRequestDto,
  SignUpConsentsResponseDto,
  SignUpRequestDto,
  SocialLoginRequestDto,
  SocialLoginResponseDto,
  UserDto,
  CurrentUserResponseDto,
} from './auth.api';
import type { Market, SocialProvider } from '../auth.types';

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

/**
 * GLOBAL 시장에만 붙는 국외 이전 동의(KAN-215). 버전 유무는 BE 가 정한다 — 화면은 서버 값을 그대로 돌려보낸다.
 * mock 은 처리방침 개정에 묶인다고 보고 버전을 둔다.
 */
const CROSS_BORDER_CONSENT: ConsentItemDto = {
  consent_type: 'cross_border_transfer',
  version: '1.0',
  is_required: true,
};

const ACCESS_TOKEN_TTL_MS = 30 * 60_000;
const SIGNUP_TOKEN_TTL_MS = 10 * 60_000;

let tokenSeq = 0;
/** social-login에서 받은 제공자를 sign-up 응답의 user.provider로 되돌려준다 */
let pendingProvider: SocialProvider = 'kakao';
/** 가입 때 정한 시장과 마지막으로 받은 기기 로캘 — 이후 응답의 user 에 되돌려준다 */
let accountMarket: Market = 'kr';
let accountLocale: { language_code: string | null; timezone: string | null } = {
  language_code: null,
  timezone: null,
};

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
  market: accountMarket,
  language_code: accountLocale.language_code,
  timezone: accountLocale.timezone,
});

export const mockSocialLogin = async (
  body: SocialLoginRequestDto,
): Promise<SocialLoginResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const nowMs = Date.now();
  pendingProvider = body.provider;
  // 기존 계정 로그인은 기기 값만 갱신한다 — 시장은 바뀌지 않는다(global-api.md 4.1)
  accountLocale = { language_code: body.locale.language_code, timezone: body.locale.timezone };

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

/** 시장은 가입 때 한 번 — 고른 언어가 우선, 없으면 기기 언어(`ko*` → kr, 그 밖 global)(global-api.md 2.1) */
const decideMarket = (locale: SignUpRequestDto['locale']): Market => {
  if (locale.preferred_language) return locale.preferred_language === 'en' ? 'global' : 'kr';
  return locale.language_code.toLowerCase().startsWith('ko') ? 'kr' : 'global';
};

/**
 * 연령 확인 행 — 서버의 나라별 판정 흉내(KAN-206 3안, `changes/pending/auth-age-by-region.md`). KR 시장 18, GLOBAL 은
 * 본인 동의 연령이 16 이하인 지역(SG·HK·KR)만 16이고 나머지·모름은 18
 */
const AGE_16_REGIONS = new Set(['SG', 'HK', 'KR']);
const ageConsentFor = (market: Market, regionCode: string | undefined): ConsentItemDto => ({
  consent_type: 'age_confirmation',
  version: null,
  is_required: true,
  min_age:
    market === 'global' && regionCode !== undefined && AGE_16_REGIONS.has(regionCode.toUpperCase())
      ? 16
      : 18,
});

/** A21 → A4 사이 동의 목록 재조회 — 고른 언어가 가리키는 시장의 목록(서버 판정 흉내) */
export const mockSignUpConsents = async (
  body: SignUpConsentsRequestDto,
): Promise<SignUpConsentsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  if (SCENARIO === 'legacy-consents') {
    // 라우터 404 — 서버 전역 필터가 `NOT_FOUND` 로 정규화한다(backend all-exceptions.filter)
    throw new ApiError(ERROR_CODES.NOT_FOUND, '찾을 수 없어요', false, null, null, 404);
  }
  const market = decideMarket(body.locale);
  return {
    required_consents: [
      ageConsentFor(market, body.locale.region_code),
      ...(market === 'global' ? [...REQUIRED_CONSENTS, CROSS_BORDER_CONSENT] : REQUIRED_CONSENTS),
    ],
    market,
  };
};

export const mockSignUp = async (body: SignUpRequestDto): Promise<AuthSessionDto> => {
  await delay(RESPONSE_DELAY_MS);
  accountMarket = decideMarket(body.locale);
  accountLocale = { language_code: body.locale.language_code, timezone: body.locale.timezone };
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

/** A20 재동의 전송(auth-api.md 4.5). 서버는 갱신 후 동의 상태를 주지만 화면이 쓰지 않는다 */
export const mockSubmitConsents = async (): Promise<void> => {
  await delay(RESPONSE_DELAY_MS);
};

/**
 * 세션 복원(auth-api.md 4.13). **mock 은 항상 복원에 성공한다** — 실패 경로(401 → 시작 화면)는
 * 토큰이 없을 때 서비스가 호출 자체를 하지 않으므로 여기서 흉내 낼 대상이 아니다.
 * 온보딩 완료 여부는 로그인 mock 과 같은 시나리오 스위치를 따른다.
 */
export const mockGetCurrentUser = async (): Promise<CurrentUserResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  return {
    user: buildUser(pendingProvider ?? 'kakao', SCENARIO !== 'onboarding'),
    pending_consents: [],
  };
};
