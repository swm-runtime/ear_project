import { FirstDripJobStatus } from '@/modules/drip/drip.enum';
import { FirstDripState } from '@/modules/drip/drip.types';

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

  static from(state: FirstDripState): GetFirstDripResponseDto {
    return {
      status: state.status,
      library_item_count: state.itemCount,
      completed_at: state.completedAt?.toISOString() ?? null,
    };
  }
}
