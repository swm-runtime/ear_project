import { User } from '@/modules/user/entities/user.entity';
import { OnboardingStep, UserMarket } from '@/modules/user/user.enum';
import { PendingConsent } from '@/modules/user/user.types';

/** 미리보기의 막힘 사유(`global-api.md` 4.11) — 막히지 않았으면 null */
export enum MarketChangeBlockedReason {
  MARKET_UNAVAILABLE = 'market_unavailable',
  COOLDOWN = 'cooldown',
}

export interface MarketChangePreview {
  currentMarket: UserMarket;
  targetMarket: UserMarket;
  blockedReason: MarketChangeBlockedReason | null;
  retryAfterSec: number | null;
  /** 옮겨 갈 시장의 필수 동의 전부 — 이미 그 시장이면 빈 배열 */
  requiredConsents: PendingConsent[];
  /** 전환 뒤 밟을 온보딩 단계 */
  steps: OnboardingStep[];
}

export interface MarketChangeResult {
  user: User;
  /** 이미 그 시장이었으면 false — 토큰을 새로 주지 않는다(멱등) */
  changed: boolean;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
}
