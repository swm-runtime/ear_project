import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { DevicePlatform } from '@/modules/user/user.enum';

import { MAX_SIGNED_PAYLOAD_LENGTH } from '../billing.constant';

/**
 * subscription-api.md 4.4.
 *
 * **평문 필드로 티어를 바꾸지 않는다** — `intent_id`·`product_id`는 조회 열쇠·교차 확인용이고, 티어를 정하는 것은
 * 서명된 거래 안의 값뿐이다(7장).
 */
export class SubmitPurchaseRequestDto {
  @IsEnum(DevicePlatform)
  readonly platform: DevicePlatform;

  /** 4.3의 값. 앱 재실행 뒤 미완료 거래를 제출할 때는 모를 수 있다 — 서명된 거래 안의 계정 토큰이 주인을 확인한다 */
  @IsOptional()
  @IsUUID()
  readonly intent_id?: string;

  /** iOS 필수 — StoreKit 2 `Transaction`의 JWS 표현. StoreKit 1 영수증(base64)은 받지 않는다 */
  @ValidateIf(
    (request: SubmitPurchaseRequestDto) =>
      request.platform === DevicePlatform.IOS,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SIGNED_PAYLOAD_LENGTH)
  readonly signed_transaction?: string;

  /** Android 필수 — Play 구현 전까지는 받아도 `SUBSCRIPTION_PLAN_UNAVAILABLE`이다(1장) */
  @ValidateIf(
    (request: SubmitPurchaseRequestDto) =>
      request.platform === DevicePlatform.ANDROID,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SIGNED_PAYLOAD_LENGTH)
  readonly purchase_token?: string;

  @ValidateIf(
    (request: SubmitPurchaseRequestDto) =>
      request.platform === DevicePlatform.ANDROID,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  readonly product_id?: string;
}
