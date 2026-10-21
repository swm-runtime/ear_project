import {
  ConsentRequirementDto,
  toConsentRequirementDto,
} from '@/modules/auth/dto/social-login-response.dto';
import { OnboardingStep, UserMarket } from '@/modules/user/user.enum';

import {
  MarketChangeBlockedReason,
  MarketChangePreview,
} from '../market-change.types';

/** `global-api.md` 4.11 — 동의 항목은 가입 재조회(`auth-api.md` 4.14)와 같은 모양이라 A4 동의 컴포넌트를 그대로 쓴다 */
export class MarketChangePreviewResponseDto {
  readonly current_market: UserMarket;
  readonly target_market: UserMarket;
  readonly available: boolean;
  readonly blocked_reason: MarketChangeBlockedReason | null;
  readonly retry_after_sec: number | null;
  readonly required_consents: ConsentRequirementDto[];
  readonly steps: OnboardingStep[];

  static from(preview: MarketChangePreview): MarketChangePreviewResponseDto {
    return {
      current_market: preview.currentMarket,
      target_market: preview.targetMarket,
      available: preview.blockedReason === null,
      blocked_reason: preview.blockedReason,
      retry_after_sec: preview.retryAfterSec,
      required_consents: preview.requiredConsents.map(toConsentRequirementDto),
      steps: preview.steps,
    };
  }
}
