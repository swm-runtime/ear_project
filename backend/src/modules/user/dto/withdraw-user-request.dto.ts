import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** auth-api.md 4.7 */
export class WithdrawUserRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly reason_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  readonly reason_text?: string;

  /** 안내 확인 체크. true가 아니면 거부한다 */
  @IsBoolean()
  readonly confirm: boolean;

  /** 활성 구독이 있을 때만 필수 — 판정은 Service가 한다 */
  @IsOptional()
  @IsBoolean()
  readonly agreed_subscription_expiry?: boolean;
}
