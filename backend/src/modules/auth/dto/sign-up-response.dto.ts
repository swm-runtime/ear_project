import { AuthenticatedResult } from '../auth.types';
import { AuthUserDto } from './auth-user.dto';
import {
  ConsentRequirementDto,
  toConsentRequirementDto,
} from './social-login-response.dto';

/** auth-api.md 4.2 — social-login의 `authenticated` 응답과 같은 형태 */
export class SignUpResponseDto {
  readonly status: 'authenticated';
  readonly access_token: string;
  readonly refresh_token: string;
  readonly access_token_expires_at: string;
  readonly pending_consents: ConsentRequirementDto[];
  readonly user: AuthUserDto;

  static from(result: AuthenticatedResult): SignUpResponseDto {
    return {
      status: 'authenticated',
      access_token: result.tokens.accessToken,
      refresh_token: result.tokens.refreshToken,
      access_token_expires_at: result.tokens.accessTokenExpiresAt.toISOString(),
      pending_consents: result.pendingConsents.map(toConsentRequirementDto),
      user: AuthUserDto.from(result.user),
    };
  }
}
