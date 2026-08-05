import { ConsentType, SocialProvider, WithdrawalReason } from './user.enum';

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
  /** null = 제공자가 주지 않음. 온보딩에서 채운다 (domain.md 3.1) */
  nickname: string | null;
  consents: ConsentInput[];
}

export interface ConsentInput {
  consentType: ConsentType;
  version: string | null;
  isAgreed: boolean;
}

export interface WithdrawUserCommand {
  userId: string;
  reasonCode: WithdrawalReason | null;
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
