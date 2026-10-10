import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  MAX_INVITE_REDEMPTIONS,
  TIMESTAMP_WITH_OFFSET,
} from './create-invite-code-request.dto';

const NOT_BLANK = /\S/;

/**
 * admin-api.md 4.23 — 초대 코드 고치기. **앞으로의 입력에 관한 값만** 받는다(이름·켜기/끄기·한도·입력 기간).
 * 코드 값·지급 요금제·지급 기간은 받지 않는다 — 이미 받은 사람과 조건이 갈린다(`forbidNonWhitelisted`로 400).
 * 한도·입력 기간에 `null`을 보내면 제한을 푼다. 보내지 않은 필드는 그대로다.
 */
export class UpdateInviteCodeRequestDto {
  // `null`은 받지 않는다(이름·켜기는 비울 수 없다) — `IsOptional`은 null 을 통과시켜 DB 오류(500)가 됐다
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(NOT_BLANK)
  @MaxLength(100)
  readonly name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  readonly is_active?: boolean;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_INVITE_REDEMPTIONS)
  readonly max_redemptions?: number | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString({ strict: true })
  @Matches(TIMESTAMP_WITH_OFFSET)
  readonly redeemable_from?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString({ strict: true })
  @Matches(TIMESTAMP_WITH_OFFSET)
  readonly redeemable_until?: string | null;
}
