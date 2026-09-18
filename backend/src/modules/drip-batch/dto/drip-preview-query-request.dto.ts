import { IsEmail } from 'class-validator';

/** `GET /admin/drip/preview?email=` — 대상 사용자는 이메일로 고른다(admin 콘솔 "추천 검증") */
export class DripPreviewQueryRequestDto {
  @IsEmail()
  readonly email: string;
}
