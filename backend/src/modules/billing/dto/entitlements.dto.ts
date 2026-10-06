import { AudioQuality } from '@/modules/content/content.enum';
import { Entitlements } from '@/modules/subscription/subscription.types';

/** subscription-api.md 2장 — 기능 분기의 유일한 근거 */
export class EntitlementsDto {
  /** `null` = 무제한 */
  readonly daily_play_limit: number | null;
  readonly daily_drip_count: number;
  readonly drip_enabled: boolean;
  readonly ads_enabled: boolean;
  /** 이 티어가 들을 수 있는 가장 높은 음질(player.md 4.9 — KAN-141) */
  readonly max_audio_quality: AudioQuality;

  static from(entitlements: Entitlements): EntitlementsDto {
    return {
      daily_play_limit: entitlements.dailyPlayLimit,
      daily_drip_count: entitlements.dailyDripCount,
      drip_enabled: entitlements.dripEnabled,
      ads_enabled: entitlements.adsEnabled,
      max_audio_quality: entitlements.maxAudioQuality,
    };
  }
}
