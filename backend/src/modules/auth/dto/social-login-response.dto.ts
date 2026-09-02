import { ConsentType } from '@/modules/user/user.enum';
import { PendingConsent } from '@/modules/user/user.types';

import {
  AuthenticatedResult,
  ConsentRequiredResult,
  SocialLoginResult,
} from '../auth.types';
import { AuthUserDto } from './auth-user.dto';

export class ConsentRequirementDto {
  readonly consent_type: ConsentType;
  readonly version: string | null;
  readonly is_required: boolean;
}

/**
 * auth-api.md 4.1 — 두 가지 상태를 `status`로 구분한다.
 * `consent_required`인 응답 시점에는 **계정이 존재하지 않는다.**
 */
export class SocialLoginResponseDto {
  readonly status: 'authenticated' | 'consent_required';
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly access_token_expires_at?: string;
  readonly pending_consents?: ConsentRequirementDto[];
  readonly user?: AuthUserDto;
  readonly signup_token?: string;
  readonly signup_token_expires_at?: string;
  readonly required_consents?: ConsentRequirementDto[];

  static from(result: SocialLoginResult): SocialLoginResponseDto {
    return result.status === 'authenticated'
      ? SocialLoginResponseDto.authenticated(result)
      : SocialLoginResponseDto.consentRequired(result);
  }

  static authenticated(result: AuthenticatedResult): SocialLoginResponseDto {
    return {
      status: 'authenticated',
      access_token: result.tokens.accessToken,
      refresh_token: result.tokens.refreshToken,
      access_token_expires_at: result.tokens.accessTokenExpiresAt.toISOString(),
      pending_consents: result.pendingConsents.map(toConsentRequirementDto),
      user: AuthUserDto.from(result.user),
    };
  }

  static consentRequired(
    result: ConsentRequiredResult,
  ): SocialLoginResponseDto {
    return {
      status: 'consent_required',
      signup_token: result.signupToken,
      signup_token_expires_at: result.signupTokenExpiresAt.toISOString(),
      required_consents: result.requiredConsents.map(toConsentRequirementDto),
    };
  }
}

export function toConsentRequirementDto(
  consent: PendingConsent,
): ConsentRequirementDto {
  return {
    consent_type: consent.consentType,
    version: consent.version,
    is_required: consent.isRequired,
  };
}
