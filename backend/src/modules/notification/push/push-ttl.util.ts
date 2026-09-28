import {
  DRIP_ARRIVAL_PUSH_TTL_MIN_SEC,
  DRIP_BATCH_HOUR_KST,
} from '../notification.constant';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 지금부터 **다음 05:00 KST 편성 배치까지** 남은 초 — 드립 도착 알림의 `ttl`(`notification.md` 4.3,
 * 결정 2026-09-26). 05:00 정각 배치가 보내는 알림은 약 24시간, 늦게 재실행된 배치의 알림은 그만큼 짧다.
 * KST는 서머타임이 없어 고정 오프셋으로 계산한다(`service-date.util`과 같은 전제).
 */
export function ttlUntilNextDripBatchSec(now: Date): number {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  let nextBatch =
    Date.UTC(
      kst.getUTCFullYear(),
      kst.getUTCMonth(),
      kst.getUTCDate(),
      DRIP_BATCH_HOUR_KST,
    ) - KST_OFFSET_MS;

  if (nextBatch <= now.getTime()) {
    nextBatch += 24 * 60 * 60 * 1000;
  }

  return Math.max(
    DRIP_ARRIVAL_PUSH_TTL_MIN_SEC,
    Math.floor((nextBatch - now.getTime()) / 1000),
  );
}
