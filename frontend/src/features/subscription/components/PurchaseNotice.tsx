import InlineNotice from '@/shared/ui/InlineNotice';

import type { PurchaseFeedback } from '../hooks/purchase-feedback';
import { SUBSCRIPTION_COPY } from '../subscription.copy';

interface PurchaseNoticeProps {
  notice: PurchaseFeedback['notice'];
  /** 서버 반영이 미뤄진 거래가 있다 — 안내가 없으면 "확인 중"을 대신 보인다 */
  isVerificationDelayed: boolean;
  isVerifying: boolean;
}

/**
 * 결제 결과의 인라인 안내 — 결제 실패는 시트·화면에 남긴다(paywall.md 5장 "시트 유지 + 인라인 에러").
 * 낭독기에는 바뀔 때 읽히게 liveRegion 을 둔다. 실패는 의미색, 안내는 보조 톤.
 */
export default function PurchaseNotice({
  notice,
  isVerificationDelayed,
  isVerifying,
}: PurchaseNoticeProps) {
  const shown =
    notice ??
    (isVerifying
      ? { message: SUBSCRIPTION_COPY.progress.verifying, tone: 'info' as const }
      : isVerificationDelayed
        ? { message: SUBSCRIPTION_COPY.result.delayed, tone: 'info' as const }
        : null);
  if (shown === null) return null;
  return <InlineNotice message={shown.message} tone={shown.tone} />;
}
