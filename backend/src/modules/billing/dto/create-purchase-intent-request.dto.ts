import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { DevicePlatform } from '@/modules/user/user.enum';

import { PurchaseEntryPoint } from '../billing.enum';

/** subscription-api.md 4.3 */
export class CreatePurchaseIntentRequestDto {
  @IsUUID()
  readonly plan_id: string;

  @IsEnum(DevicePlatform)
  readonly platform: DevicePlatform;

  /** 전환 분석용. **판정에 쓰지 않는다** */
  @IsOptional()
  @IsEnum(PurchaseEntryPoint)
  readonly entry_point?: PurchaseEntryPoint;
}
