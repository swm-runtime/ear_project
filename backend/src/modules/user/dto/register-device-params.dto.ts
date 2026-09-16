import { IsString, MaxLength } from 'class-validator';

/**
 * onboarding-api.md 4.9 — 경로 파라미터 `device_id`.
 *
 * `device_tokens.device_id`는 varchar(255)라 상한 없이 받으면 긴 값이 DB 오류(500)로
 * 떨어진다. 상한은 같은 값을 본문으로 받는 auth DTO들(`device_id` 200자)과 맞춘다.
 */
export class RegisterDeviceParamsDto {
  @IsString()
  @MaxLength(200)
  readonly deviceId: string;
}
