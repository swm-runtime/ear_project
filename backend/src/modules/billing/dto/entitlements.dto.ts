import { Entitlements } from '@/modules/subscription/subscription.types';

/** subscription-api.md 2장 — 기능 분기의 유일한 근거 */
export class EntitlementsDto {
  /** `null` = 무제한 */
  readonly daily_play_limit: number | null;
  readonly daily_drip_count: number;
  readonly drip_enabled: boolean;
  readonly ads_enabled: boolean;

  static from(entitlements: Entitlements): EntitlementsDto {
    return {
      daily_play_limit: entitlements.dailyPlayLimit,
      daily_drip_count: entitlements.dailyDripCount,
      drip_enabled: entitlements.dripEnabled,
      ads_enabled: entitlements.adsEnabled,
    };
  }
}
