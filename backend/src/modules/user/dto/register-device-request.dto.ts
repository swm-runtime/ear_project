import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { DevicePlatform } from '../user.enum';

/** onboarding-api.md 4.9 — 알림 권한 응답과 푸시 토큰을 서버에 반영한다 */
export class RegisterDeviceRequestDto {
  /**
   * 권한이 거부되면 `null`을 보낸다. `@IsOptional()`은 `null`도 통과시켜 버려서
   * 값이 있을 때의 형식 검증이 사라지므로, `null`만 예외로 두고 검증한다.
   */
  @ValidateIf((_object, value) => value !== null)
  @IsOptional()
  @IsString()
  @MaxLength(512)
  readonly push_token?: string | null;

  @IsEnum(DevicePlatform)
  readonly platform: DevicePlatform;

  /** **device 단위 값이다** (domain.md 3.6) */
  @IsBoolean()
  readonly is_os_permission_granted: boolean;

  @IsString()
  @MaxLength(20)
  readonly app_version: string;
}
