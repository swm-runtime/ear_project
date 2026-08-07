/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

/**
 * `paywall.md` 4.1이 판정에 쓰는 티어 정책. **티어명을 코드에 하드코딩하지 않기 위해**
 * 판정에 필요한 두 값만 `plans`에서 읽어 넘긴다.
 */
export interface PlayLimitPolicy {
  /** `plans.daily_play_limit`. **null이면 무제한이라 판정 자체가 없다** */
  dailyPlayLimit: number | null;
  /**
   * 한도를 소진했을 때 **페이월 대신 한도 안내만** 띄워야 하는 티어인가.
   * 더 올라갈 티어가 없어 팔 것이 없는 경우다(합의 2026-08-06).
   */
  isTopTier: boolean;
}
