import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { WithdrawalReason } from '../user.enum';

/** auth-api.md 4.7 */
export class WithdrawUserRequestDto {
  /** 선택형 사유 — 목록 밖의 값은 받지 않는다 (auth-api.md 9장) */
  @IsOptional()
  @IsEnum(WithdrawalReason)
  readonly reason_code?: WithdrawalReason;

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
