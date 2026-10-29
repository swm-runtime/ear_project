import { FirstDripJobStatus } from '@/modules/drip/drip.enum';

import { FirstDripView } from '../onboarding.types';

/**
 * onboarding-api.md 4.8.
 *
 * **`pending`을 202나 404로 표현하지 않는다.** 진행 중은 정상 상태이고 클라이언트는
 * 네 갈래로 분기해야 하는데, HTTP status로는 그 분기를 만들 수 없다.
 */
export class GetFirstDripResponseDto {
  readonly status: FirstDripJobStatus;
  /** 적립은 원자적이라 `completed`면 이 값이 편성된 전량이다 */
  readonly library_item_count: number;
  readonly completed_at: string | null;
  /**
   * 온보딩 직후 멈춘 플레이어로 열 편(`experiments-api.md` 4.1 — KAN-292). `completed`일 때만 값이 있고,
   * 첫 드립 편이 전부 지워졌거나 이미 재생됐거나 회수·만료됐으면 `null`이다
   */
  readonly first_content_id: string | null;

  static from(state: FirstDripView): GetFirstDripResponseDto {
    return {
      status: state.status,
      library_item_count: state.itemCount,
      completed_at: state.completedAt?.toISOString() ?? null,
      first_content_id: state.firstContentId,
    };
  }
}
