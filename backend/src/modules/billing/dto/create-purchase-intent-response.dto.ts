import { PurchaseIntentResult } from '../billing.types';

/** subscription-api.md 4.3 */
export class CreatePurchaseIntentResponseDto {
  readonly intent_id: string;
  readonly store_product_id: string;
  /**
   * 결제에 반드시 실어 보낸다(iOS `appAccountToken` · Android `obfuscatedAccountId`). 값은 `intent_id`와 같다 —
   * 따로 내려주는 이유는 "결제에 넣는 값"과 "제출 때 되돌려 보내는 값"의 쓰임이 달라서다
   */
  readonly account_token: string;

  static from(result: PurchaseIntentResult): CreatePurchaseIntentResponseDto {
    return {
      intent_id: result.intentId,
      store_product_id: result.storeProductId,
      account_token: result.intentId,
    };
  }
}
