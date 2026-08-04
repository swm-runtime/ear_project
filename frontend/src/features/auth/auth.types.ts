export type SocialProvider = 'kakao' | 'naver' | 'google';

/** 서버 계약의 consent_type 값 그대로 쓴다(convention.md 1.6) */
export type ConsentType = 'terms' | 'privacy' | 'marketing';

export interface AuthUser {
  id: string;
  nickname: string;
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
