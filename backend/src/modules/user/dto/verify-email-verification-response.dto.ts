export class VerifyEmailVerificationResponseDto {
  readonly email: string;
  readonly is_email_verified: boolean;
  readonly verified_at: string;

  static from(result: {
    email: string;
    verifiedAt: Date;
  }): VerifyEmailVerificationResponseDto {
    return {
      email: result.email,
      is_email_verified: true,
      verified_at: result.verifiedAt.toISOString(),
    };
  }
}
