import { UserTier } from '@/modules/user/user.enum';

import { PlanStatus } from './subscription.enum';

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

/**
 * 플랜 카드에 그릴 값(`profile-api.md` 4.1 · `settings-api.md` 4.1).
 *
 * **두 화면이 같은 조립 함수를 쓴다**(`settings-api.md` 4.1) — 각자 조립하면 프로필과 설정의
 * 구독 표시가 어긋난다.
 */
export interface PlanView {
  status: PlanStatus;
  tier: UserTier;
  planName: string;
  /** `null`은 무제한 티어. 무료 카드의 "하루 N편" 문구를 조립하는 값이다 */
  dailyPlayLimit: number | null;
  /** 자동 갱신 중일 때의 다음 결제일. 그 외에는 `null` */
  renewsAt: Date | null;
  /** 해지 예약·유예일 때의 이용 종료일. 그 외에는 `null` */
  expiresAt: Date | null;
  hasPaymentIssue: boolean;
}
