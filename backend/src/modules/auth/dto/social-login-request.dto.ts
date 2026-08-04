import { IsEnum, IsString, MaxLength } from 'class-validator';

import { SocialProvider } from '@/modules/user/user.enum';

/** auth-api.md 4.1 — 동의 값을 여기에 싣지 않는다. 동의는 로그인 성공 이후 별도 화면에서 받는다 */
export class SocialLoginRequestDto {
  @IsEnum(SocialProvider)
  readonly provider: SocialProvider;

  /** 서버가 제공자 API로 반드시 검증한다 */
  @IsString()
  @MaxLength(4096)
  readonly provider_token: string;

  @IsString()
  @MaxLength(200)
  readonly device_id: string;
}
