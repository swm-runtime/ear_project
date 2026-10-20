import { DRIP_ARRIVAL_PUSH_TTL_MIN_SEC } from '../notification.constant';

/**
 * 지금부터 **그 사용자 그룹의 다음 편성 배치까지** 남은 초 — 드립 도착 알림의 `ttl`(`notification.md` 4.3,
 * 결정 2026-09-26). 다음 배치가 새 알림을 보내므로 그 뒤까지 보관하면 며칠치 "오늘"이 한꺼번에 뜬다.
 *
 * 다음 배치 시각은 호출부(편성 배치)가 그룹 기준으로 정해 넘긴다(2026-10-15) — 종전에는 여기서 "다음 05:00 KST"로
 * 고정해, 현지 07:00이 KST 21~22시인 americas 그룹 알림은 7~8시간 만에 만료됐다
 * (`changes/archive/drip-timezone-groups.md` · 반영 2026-10-15).
 * 하한은 배치 소요 시간 안에 만료되지 않게 둔다.
 */
export function ttlUntilNextDripBatchSec(nextBatchAt: Date, now: Date): number {
  return Math.max(
    DRIP_ARRIVAL_PUSH_TTL_MIN_SEC,
    Math.floor((nextBatchAt.getTime() - now.getTime()) / 1000),
  );
}
