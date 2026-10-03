import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { DevicePlatform } from '@/modules/user/user.enum';

import {
  MAX_RESTORE_TRANSACTIONS,
  MAX_SIGNED_PAYLOAD_LENGTH,
} from '../billing.constant';

class RestorePlayPurchaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SIGNED_PAYLOAD_LENGTH)
  readonly purchase_token: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  readonly product_id: string;
}

/**
 * subscription-api.md 4.5. 배열은 **0~10건** — 스토어에 유효한 구독이 없으면 빈 배열을 보낸다
 * (요청 자체는 한다. 서버가 "없음"을 답한다).
 */
export class RestorePurchasesRequestDto {
  @IsEnum(DevicePlatform)
  readonly platform: DevicePlatform;

  /** iOS — `Transaction.currentEntitlements`의 JWS들 */
  @ValidateIf(
    (request: RestorePurchasesRequestDto) =>
      request.platform === DevicePlatform.IOS,
  )
  @IsArray()
  @ArrayMaxSize(MAX_RESTORE_TRANSACTIONS)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(MAX_SIGNED_PAYLOAD_LENGTH, { each: true })
  readonly signed_transactions?: string[];

  /** Android — `queryPurchasesAsync`의 구매들. `product_id`는 참고값이고 서버는 Google이 답한 상품만 믿는다 */
  @ValidateIf(
    (request: RestorePurchasesRequestDto) =>
      request.platform === DevicePlatform.ANDROID,
  )
  @IsArray()
  @ArrayMaxSize(MAX_RESTORE_TRANSACTIONS)
  @ValidateNested({ each: true })
  @Type(() => RestorePlayPurchaseDto)
  readonly purchases?: RestorePlayPurchaseDto[];
}
