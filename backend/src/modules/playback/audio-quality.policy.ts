import {
  AUDIO_QUALITY_ORDER,
  AudioQuality,
  audioQualityRank,
} from '@/modules/content/content.enum';
import { DevicePlatform } from '@/modules/user/user.enum';
import { isVersionLowerThan, SEMVER_PATTERN } from '@/common/utils/semver.util';

import { IOS_LOSSLESS_MIN_APP_VERSION } from './playback.constant';

/**
 * 재생 URL 발급의 음질 판정(`player.md` 4.9 · `player-api.md` 4.1 — KAN-141). 순수 함수라 서비스 없이 검증한다.
 *
 * `요청 → min(요청, 티어 허용 최대) → 그 이하에서 콘텐츠가 가진 가장 높은 음질`. **거절하지 않는다** — 음질 때문에
 * 재생이 멈추는 일은 없어야 한다. 깎였으면 이유를 함께 돌려준다: 티어 때문이면 `not_allowed`(화면은 잠금·구독 안내),
 * 파일이 없어서면 `not_available`(안내 없음). 둘 다면 `not_allowed` — 사용자가 할 수 있는 일이 있는 쪽이다.
 *
 * `available`이 비어 있을 수는 없다(`compressed` 행은 항상 있다 — domain.md 5.8). 그래도 비어 오면 `compressed`로 돌려
 * 호출부가 기존 `contents.audio_path`로 재생하게 한다.
 */
export type AudioQualityFallbackReason = 'not_allowed' | 'not_available';

export interface AudioQualityDecision {
  /** 실제로 내줄 음질 */
  quality: AudioQuality;
  /** 판정에 들어간 음질(요청 → 설정 → 티어 허용 최고 선택지) */
  requestedQuality: AudioQuality;
  fallbackReason: AudioQualityFallbackReason | null;
}

export function resolveAudioQuality(input: {
  requested: AudioQuality;
  maxAllowed: AudioQuality;
  available: readonly AudioQuality[];
}): AudioQualityDecision {
  const { requested, maxAllowed } = input;
  const availableRanks = new Set(input.available.map(audioQualityRank));

  const cappedRank = Math.min(
    audioQualityRank(requested),
    audioQualityRank(maxAllowed),
  );
  const notAllowed = cappedRank < audioQualityRank(requested);

  let servedRank = cappedRank;
  while (servedRank >= 0 && !availableRanks.has(servedRank)) {
    servedRank -= 1;
  }

  if (servedRank < 0) {
    return {
      quality: AudioQuality.COMPRESSED,
      requestedQuality: requested,
      fallbackReason: notAllowed ? 'not_allowed' : 'not_available',
    };
  }

  const quality = AUDIO_QUALITY_ORDER[servedRank];
  const fallbackReason =
    quality === requested ? null : notAllowed ? 'not_allowed' : 'not_available';

  return { quality, requestedQuality: requested, fallbackReason };
}

/** 응답의 `available_qualities` — 오름차순, 중복 없이 */
export function sortAudioQualities(
  qualities: readonly AudioQuality[],
): AudioQuality[] {
  return AUDIO_QUALITY_ORDER.filter((quality) => qualities.includes(quality));
}

/**
 * 이 기기가 무손실(FLAC)을 제대로 재생하는가(2026-10-23 — KAN-256).
 *
 * iOS AVPlayer 는 내려받으며 재생하는 FLAC 의 시각을 평균 비트레이트로 어림해 **재생 위치·길이가 틀린다**(대본 강조 어긋남·
 * 중간에 끝남 — 1.2.1 실기기 재현, Android 는 정상). 앱이 정확한 시각 옵션을 켜는 빌드(`IOS_LOSSLESS_MIN_APP_VERSION`)부터
 * 무손실을 준다. 그 전 iOS 앱에는 콘텐츠가 무손실을 갖지 않은 것처럼 판정해 압축으로 내린다 — 티어 탓이 아니니
 * 이유는 `not_available`(구독 안내 없음)이 된다.
 *
 * 기기 정보는 `device_tokens`(포그라운드 복귀마다 앱 버전 갱신)에서 온다. **행이 없거나 버전 형식이 깨졌으면 주지 않는다** —
 * 음질을 한 단계 낮추는 비용이 재생이 어긋나는 비용보다 작다.
 */
export function canPlayLossless(
  device: { platform: DevicePlatform; appVersion: string } | null,
): boolean {
  if (device === null) {
    return false;
  }
  if (device.platform !== DevicePlatform.IOS) {
    return true;
  }

  return (
    SEMVER_PATTERN.test(device.appVersion) &&
    !isVersionLowerThan(device.appVersion, IOS_LOSSLESS_MIN_APP_VERSION)
  );
}
