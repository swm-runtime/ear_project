import { ConsentType, SocialProvider } from './user.enum';

/**
 * convention.md 3.2 — Service 경계에는 HTTP DTO 대신 Command 타입을 쓴다.
 * 모듈 밖으로 공개되는 타입만 이 파일에 둔다.
 */

/** 소셜 프로필에서 환산한 계정 생성 입력 (auth.md 4.1) */
export interface CreateUserCommand {
  provider: SocialProvider;
  providerUserId: string;
  /** 마스킹 주소는 null로 들어온다 */
  email: string | null;
  isEmailVerified: boolean;
  nickname: string;
  consents: ConsentInput[];
}

export interface ConsentInput {
  consentType: ConsentType;
  version: string | null;
  isAgreed: boolean;
}

export interface WithdrawUserCommand {
  userId: string;
  reasonCode: string | null;
  reasonText: string | null;
  confirm: boolean;
  agreedSubscriptionExpiry: boolean;
}

export interface ConsentState {
  consentType: ConsentType;
  version: string | null;
  isAgreed: boolean;
  agreedAt: Date;
}

/** 재동의가 필요한 항목 (auth-api.md 4.1 `pending_consents`) */
export interface PendingConsent {
  consentType: ConsentType;
  version: string | null;
  isRequired: boolean;
}
