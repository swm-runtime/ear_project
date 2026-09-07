export type SocialProvider = 'kakao' | 'naver' | 'google' | 'apple';

/** 서버 계약의 consent_type 값 그대로 쓴다(convention.md 1.6) */
/**
 * 서버가 받는 동의 유형(domain.md 3.2). `age_confirmation` 은 열람할 문서가 없는
 * 자기 선언이라 `version` 이 항상 null 이다 — 마케팅과 같다.
 */
export type ConsentType = 'terms' | 'privacy' | 'marketing' | 'age_confirmation';

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
