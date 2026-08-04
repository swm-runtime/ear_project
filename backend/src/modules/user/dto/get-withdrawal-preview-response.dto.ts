import { WithdrawalPreview } from '../services/user-withdrawal.service';

export class RetainedItemsDto {
  readonly years: number;
  readonly items: string[];
}

/**
 * auth-api.md 4.6 — `retained`가 빈 배열이 아니라 `null`인 이유:
 * "보존할 항목이 0건"과 "보존 자체가 없음"은 화면이 달라진다.
 */
export class GetWithdrawalPreviewResponseDto {
  readonly has_payment_history: boolean;
  readonly has_active_subscription: boolean;
  readonly subscription_expiry_agreement_required: boolean;
  readonly retained: RetainedItemsDto | null;

  static from(preview: WithdrawalPreview): GetWithdrawalPreviewResponseDto {
    return {
      has_payment_history: preview.hasPaymentHistory,
      has_active_subscription: preview.hasActiveSubscription,
      subscription_expiry_agreement_required:
        preview.subscriptionExpiryAgreementRequired,
      retained: preview.retained,
    };
  }
}
