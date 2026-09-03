import { IssuedTokens } from '../auth.types';

/** 파이프라인 웹 SSO — 일반 세션과 같은 토큰 쌍을 내준다 (changes/pending/pipeline-sso-login.md) */
export class PipelineLoginResponseDto {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly access_token_expires_at: string;

  static from(tokens: IssuedTokens): PipelineLoginResponseDto {
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
    };
  }
}
