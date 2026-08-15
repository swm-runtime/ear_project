export type SocialProvider = 'kakao' | 'naver' | 'google' | 'apple';

/** 서버 계약의 consent_type 값 그대로 쓴다(convention.md 1.6) */
export type ConsentType = 'terms' | 'privacy' | 'marketing';

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

export type AuthStackParamList = {
  Start: undefined;
  TermsConsent: {
    signupToken: string;
    requiredConsents: RequiredConsent[];
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
