import { RestoreResult } from '../billing.types';
import { SubscriptionResponseDto } from './subscription-response.dto';

/** subscription-api.md 4.5 */
export class RestorePurchasesResponseDto {
  /** 이 요청으로 유효한 구독이 이 계정에 연결돼 있으면 `true`(이미 연결돼 있던 경우 포함) */
  readonly restored: boolean;
  /** 복원 후 상태 — 4.2와 같은 본문 */
  readonly subscription: SubscriptionResponseDto;

  static from(result: RestoreResult): RestorePurchasesResponseDto {
    return {
      restored: result.restored,
      subscription: SubscriptionResponseDto.from(result.subscription),
    };
  }
}
