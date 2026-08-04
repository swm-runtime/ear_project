import { IssuedTokens } from '../auth.types';

/** auth-api.md 4.3 — 새 access_token + **새 refresh_token**(회전) */
export class RefreshTokenResponseDto {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly access_token_expires_at: string;

  static from(tokens: IssuedTokens): RefreshTokenResponseDto {
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
    };
  }
}
