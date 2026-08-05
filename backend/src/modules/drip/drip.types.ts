import { FirstDripJobStatus } from './drip.enum';

/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

/** onboarding-api.md 4.8 — 첫 드립 편성 상태 */
export interface FirstDripState {
  status: FirstDripJobStatus;
  /** 적립은 원자적이라 `completed`면 이 값이 편성된 전량이다 */
  itemCount: number;
  completedAt: Date | null;
}
