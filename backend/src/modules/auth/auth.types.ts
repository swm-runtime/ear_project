import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider } from '@/modules/user/user.enum';
import { ConsentInput, PendingConsent } from '@/modules/user/user.types';

/** 제공자 API로 검증한 프로필. 클라이언트가 보낸 값은 쓰지 않는다 (architecture.md 9.1) */
export interface SocialProfile {
  providerUserId: string;
  /** 마스킹 주소는 저장하지 않으므로 null로 환산해 들어온다 (auth.md 4.1) */
  email: string | null;
  isEmailVerified: boolean;
  nickname: string | null;
}

export interface SocialLoginCommand {
  provider: SocialProvider;
  providerToken: string;
  deviceId: string;
}

export interface SignUpCommand {
  signupToken: string;
  deviceId: string;
  consents: ConsentInput[];
}

export interface RefreshTokenCommand {
  refreshToken: string;
  deviceId: string;
}

export interface LogoutCommand {
  userId: string;
  deviceId: string;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
}

/** 기존 계정 — 바로 로그인된다 */
export interface AuthenticatedResult {
  status: 'authenticated';
  tokens: IssuedTokens;
  user: User;
  pendingConsents: PendingConsent[];
}

/** 신규 계정 — **이 시점에는 계정이 존재하지 않는다** (auth.md 4.1) */
export interface ConsentRequiredResult {
  status: 'consent_required';
  signupToken: string;
  signupTokenExpiresAt: Date;
  requiredConsents: PendingConsent[];
}

export type SocialLoginResult = AuthenticatedResult | ConsentRequiredResult;
