import { IsOptional, IsString, MaxLength } from 'class-validator';

/** admin.md 3.3 — 회수 사유는 선택이다. 감사 로그에만 남고 사용자에게 노출되지 않는다 */
export class WithdrawContentRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly reason?: string;
}
