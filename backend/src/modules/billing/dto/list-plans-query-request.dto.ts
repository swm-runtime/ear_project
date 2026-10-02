import { IsEnum } from 'class-validator';

import { DevicePlatform } from '@/modules/user/user.enum';

/** subscription-api.md 4.1 */
export class ListPlansQueryRequestDto {
  /** 어느 스토어의 상품 ID를 내려줄지. 필수 */
  @IsEnum(DevicePlatform)
  readonly platform: DevicePlatform;
}
