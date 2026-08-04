import { IsNumberString, Length } from 'class-validator';

import { EMAIL_VERIFICATION_CODE_LENGTH } from '../user.constant';

/** auth.md 4.5 — 6자리 숫자 코드 */
export class VerifyEmailVerificationRequestDto {
  @IsNumberString({ no_symbols: true })
  @Length(EMAIL_VERIFICATION_CODE_LENGTH, EMAIL_VERIFICATION_CODE_LENGTH)
  readonly code: string;
}
