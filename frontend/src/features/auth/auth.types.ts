export type SocialProvider = 'kakao' | 'naver' | 'google' | 'apple';

/**
 * 사용자의 시장(`users.market` — global-api.md 2.1). **가입 때 서버가 한 번 정하고 바꾸지 않는다.**
 * 클라이언트는 응답 값을 그대로 쓰고 기기 언어로 추측하지 않는다(영어 설정 한국 사용자가 GLOBAL로 보인다).
 */
export type Market = 'kr' | 'global';

/** 가입 화면(A21)에서 사용자가 고른 콘텐츠 언어 — 시장 판정의 입력(`ko` → `kr`, `en` → `global`) */
export type ContentLanguage = 'ko' | 'en';

/** 서버 계약의 consent_type 값 그대로 쓴다(convention.md 1.6) */
/**
 * 서버가 받는 동의 유형(domain.md 3.2). `age_confirmation` 은 열람할 문서가 없는
 * 자기 선언이라 `version` 이 항상 null 이다 — 마케팅과 같다.
 * `cross_border_transfer`(국외 이전 동의, KAN-215·216)는 **서버가 GLOBAL 목록에만 싣는다** — 클라이언트는 시장으로
 * 넣거나 빼지 않고 서버 목록대로 그린다.
 */
export type ConsentType =
  'terms' | 'privacy' | 'marketing' | 'age_confirmation' | 'cross_border_transfer';

/**
 * `GET /users/me`(auth-api.md 4.13) — 실행 관문의 세션 복원 입력.
 * **`user`는 로그인(4.1)의 것과 같은 모양이다** — 두 경로가 다른 판정을 하면 안 된다.
 */
export interface RestoredSession {
  user: AuthUser;
  pendingConsents: RequiredConsent[];
}

export interface AuthUser {
  id: string;
  /** 온보딩 전에는 null이다(auth-api.md 4.1) */
  nickname: string | null;
  email: string | null;
  isEmailVerified: boolean;
  provider: SocialProvider;
  /** 표시용 값. 기능 분기는 entitlements로만 한다 — 티어명 비교 금지(architecture.md 1) */
  tier: string;
  role: string;
  onboardingCompleted: boolean;
  onboardingStep: string;
  /**
   * 서버 판정 시장(global-api.md 4.1). 필드가 없는 응답(구 서버)은 `kr` 로 받는다 —
   * 서버 폴백 규칙("없으면 `kr`")과 같은 값이다.
   */
  market: Market;
  /** 서버에 저장된 기기 언어(BCP 47). 구 서버·미수집 계정은 null */
  languageCode: string | null;
  /** 서버에 저장된 시간대(IANA). 구 서버·미수집 계정은 null */
  timezone: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}

/** 서버가 내려주는 동의 항목 — 현행 버전을 클라이언트에 하드코딩하지 않는다(auth-api.md 4.1) */
export interface RequiredConsent {
  consentType: ConsentType;
  version: string | null;
  isRequired: boolean;
  /**
   * 연령 확인(`age_confirmation`)의 기준 연령 — **서버가 시장·기기 지역으로 판정해 내려준다**(KAN-206 나라별 결정,
   * PM 2026-10-16). 다른 유형·구 서버 응답에는 없다 → 화면이 `FALLBACK_MIN_AGE`(시장별 보수값)로 그린다
   */
  minAge?: number;
}

export interface ConsentSubmission {
  consentType: ConsentType;
  version: string | null;
  isAgreed: boolean;
}

export interface AuthSession {
  tokens: AuthTokens;
  user: AuthUser;
  /** 기존 계정의 약관 개정 재동의 필요 항목(auth-api.md 4.1) */
  pendingConsents: RequiredConsent[];
}

export type SocialLoginResult =
  | ({ status: 'authenticated' } & AuthSession)
  | {
      status: 'consent_required';
      signupToken: string;
      signupTokenExpiresAt: string;
      requiredConsents: RequiredConsent[];
    };

/** 신규 가입 흐름이 화면 사이로 넘기는 값 — social-login 의 consent_required 응답 */
export interface SignUpParams {
  signupToken: string;
  requiredConsents: RequiredConsent[];
}

export type AuthStackParamList = {
  Start: undefined;
  /** A21 콘텐츠 언어 선택 — 신규 가입자만 거친다(A1 → A21 → A4) */
  ContentLanguage: SignUpParams;
  /**
   * `requiredConsents` 는 A21에서 언어를 고른 뒤 **다시 받은 목록**이다(`POST /auth/sign-up/consents`, PM 2026-10-16).
   * 구 서버(엔드포인트 없음)면 로그인 응답의 목록 그대로다.
   */
  TermsConsent: SignUpParams & {
    /** A21에서 고른 값. 가입 요청의 `locale.preferred_language` 로 보낸다 */
    preferredLanguage: ContentLanguage;
    /**
     * 재조회에서 서버가 판정한 시장 — 연령 문구·문서 링크의 기준. 없으면(구 서버·폴백) A21 선택이 가리키는 시장으로 그린다
     */
    market?: Market;
  };
};

/* ── 이메일 인증(auth.md 4.5 · auth-api.md 4.8~4.11) ── */

/**
 * 진행 중인 인증 건 — 발송 응답(4.8)과 재진입 조회(4.9)를 같은 모델로 받는다.
 * 시각 값(expiresAt·resendAvailableAt·sendLockedUntil)은 전부 서버가 준 것이며,
 * 클라이언트 타이머는 표시용이다(architecture.md 1 — 기기 시각 판정 금지).
 */
export interface ActiveEmailVerification {
  verificationId: string;
  email: string;
  expiresAt: string;
  attemptsRemaining: number;
  resendAvailableAt: string;
  /** 요청한 주소 기준 값이다 — 다른 주소는 다른 카운터를 갖는다(auth-api.md 4.8) */
  sendCountUsed: number;
  sendCountLimit: number;
  /** 그 주소의 발송 잠금 해제 시각. 발송 응답(4.8)에는 없어 null이다 */
  sendLockedUntil: string | null;
}

/** 검증 성공 결과(auth-api.md 4.10) — 서버가 users에 저장을 끝낸 뒤의 값이다 */
export interface EmailVerifiedResult {
  email: string;
  isEmailVerified: boolean;
  verifiedAt: string;
}

/* ── 회원 탈퇴(auth.md 4.3 · auth-api.md 4.6~4.7) ── */

/** `withdrawal-preview`의 보존 항목. 결제 이력이 없으면 이 객체 자체가 없다(null) */
export interface WithdrawalRetention {
  years: number;
  /** 서버가 내려주는 항목 키(`email` · `subscription_history` · `consent_history`) */
  items: string[];
}

/**
 * A7의 구성을 가르는 서버 판정(auth-api.md 4.6).
 * **클라이언트가 `user.tier`로 추측하지 않는다** — 결제 후 만료돼 무료로 돌아온 사용자를
 * "결제 이력 없음"으로 잘못 안내하게 된다.
 */
export interface WithdrawalPreview {
  hasPaymentHistory: boolean;
  hasActiveSubscription: boolean;
  subscriptionExpiryAgreementRequired: boolean;
  /** 결제 이력이 없으면 null이다 — 빈 배열이 아니다(보존 섹션을 그리지 않는 근거) */
  retained: WithdrawalRetention | null;
}

/**
 * 선택형 사유 값(auth-api.md 4.7 `reason_code`) — 노출 순서는 `auth.constants.ts`의
 * WITHDRAWAL_REASON_CODES가 소유한다. SOCIAL_PROVIDERS와 같은 분담이다.
 */
export type WithdrawalReasonCode =
  | 'content_quailty'
  | 'recommendation_mismatch'
  | 'low_usage'
  | 'price'
  | 'not_enough_content'
  | 'app_issue'
  | 'alternative'
  | 'other';

/** 탈퇴 요청 본문의 도메인 모델(auth-api.md 4.7) */
export interface WithdrawalSubmission {
  reasonCode: WithdrawalReasonCode | null;
  reasonText: string | null;
  /** 안내 확인 체크. true가 아니면 서버가 거절한다 */
  confirm: boolean;
  /** 활성 구독이 있을 때만 실어 보낸다. 그 외에는 null(키 자체를 싣지 않는다) */
  agreedSubscriptionExpiry: boolean | null;
}
