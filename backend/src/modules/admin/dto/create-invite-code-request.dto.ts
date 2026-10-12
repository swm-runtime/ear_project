import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { UserTier } from '@/modules/user/user.enum';

/** 공백만 있는 이름을 막는다 */
const NOT_BLANK = /\S/;
/** 입력 전 형태 — 서버가 대문자로 맞춘 뒤 `INVITE_CODE_PATTERN`(A-Z 0-9 -, 4~32자)으로 저장한다 */
const CODE_INPUT = /^\s*[A-Za-z0-9-]{4,32}\s*$/;
const DATE_LABEL = /^\d{4}-\d{2}-\d{2}$/;
/** 시각에는 시간대를 반드시 붙인다 — 없으면 서버 시간대로 해석돼 9시간 어긋난다 */
export const TIMESTAMP_WITH_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;
/** int4 범위 안의 넉넉한 상한 — 넘으면 DB 오류(500)가 아니라 400 이어야 한다 */
export const MAX_INVITE_REDEMPTIONS = 1_000_000;

/**
 * admin-api.md 4.23 — 초대 코드 만들기. 지급 기간은 `grant_days`와 `grant_until_date` 중 **정확히 하나**다
 * (둘 다·둘 다 없음은 400 — 서비스에서 판정). `code`를 비우면 서버가 8자로 만든다.
 */
export class CreateInviteCodeRequestDto {
  @IsOptional()
  @Matches(CODE_INPUT)
  readonly code?: string;

  @IsString()
  @Matches(NOT_BLANK)
  @MaxLength(100)
  readonly name: string;

  @IsIn([UserTier.DAILY, UserTier.PRO])
  readonly tier: UserTier;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(366)
  readonly grant_days?: number;

  /** 지급 마지막 서비스 날짜(`YYYY-MM-DD`, 그날까지 포함) */
  @IsOptional()
  @Matches(DATE_LABEL)
  @IsDateString({ strict: true })
  readonly grant_until_date?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INVITE_REDEMPTIONS)
  readonly max_redemptions?: number;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(TIMESTAMP_WITH_OFFSET)
  readonly redeemable_from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(TIMESTAMP_WITH_OFFSET)
  readonly redeemable_until?: string;
}
