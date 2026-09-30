import { RecommendTestActionResult } from '../recommend-test.types';

/** `POST /admin/recommend-test/actions` 200 — 무엇이 실제로 일어났는지. 추천 결과는 미리보기·피드를 다시 불러 본다 */
export class RecommendTestActionResponseDto {
  readonly action: string;
  readonly content_id: string;
  readonly performed_at: string;
  /** 앱이 남기는 것과 같은 부수 효과의 요약 — 콘솔의 행동 로그에 그대로 적는다 */
  readonly effects: string[];
  /** 배치가 하는 취향 캐시 재계산을 행동 직후 수행했는가(탐색 피드가 이 캐시를 읽는다) */
  readonly preference_rebuilt: boolean;

  static from(
    result: RecommendTestActionResult,
  ): RecommendTestActionResponseDto {
    return {
      action: result.action,
      content_id: result.contentId,
      performed_at: result.performedAt.toISOString(),
      effects: result.effects,
      preference_rebuilt: result.preferenceRebuilt,
    };
  }
}
