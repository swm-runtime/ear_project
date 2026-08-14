import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /**
   * **애플 전용.** 클라이언트가 애플 인가 요청에 실은 원본 nonce다 — 서버가 해시해서
   * identity token의 `nonce` 클레임과 대조한다(재전송 공격 차단, `auth-api.md` 4.1).
   *
   * 스키마상 선택이지만 **애플에서는 없으면 검증에 실패한다.** 다른 제공자는 무시한다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  readonly nonce?: string;
}
