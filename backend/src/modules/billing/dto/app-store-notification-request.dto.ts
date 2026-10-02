import { IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_SIGNED_PAYLOAD_LENGTH } from '../billing.constant';

/**
 * subscription-api.md 4.6 — App Store Server Notifications V2의 본문.
 * **필드명은 Apple이 보내는 그대로다**(`signedPayload` — 우리 snake_case 규약의 예외. 호출자가 Apple이다).
 */
export class AppStoreNotificationRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SIGNED_PAYLOAD_LENGTH)
  readonly signedPayload: string;
}
