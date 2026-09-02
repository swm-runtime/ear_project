import { IsString, MaxLength } from 'class-validator';

/**
 * auth-api.md 4.8 — 코드 발송.
 * 형식 위반은 `EMAIL_FORMAT_INVALID`로 내려가야 하므로 형식 판정은 Service가 한다.
 */
export class SendEmailVerificationRequestDto {
  @IsString()
  @MaxLength(320)
  readonly email: string;
}
