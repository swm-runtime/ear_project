import { FirstDripState } from '@/modules/drip/drip.types';

/** `POST /admin/recommend-test/first-drip` — 다시 실행한 첫 드립의 결과. 편성분 자체는 계정 라이브러리(`source = drip`)로 본다 */
export class RecommendTestFirstDripResponseDto {
  /** `completed` · `no_candidates` (실패는 예외로 끝난다) */
  readonly status: string;
  readonly item_count: number;
  readonly completed_at: string | null;

  static from(state: FirstDripState): RecommendTestFirstDripResponseDto {
    return {
      status: state.status,
      item_count: state.itemCount,
      completed_at: state.completedAt?.toISOString() ?? null,
    };
  }
}
