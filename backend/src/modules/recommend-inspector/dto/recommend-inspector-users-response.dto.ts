import {
  InspectorUserRow,
  InspectorUserSort,
} from '../recommend-inspector.types';

interface InspectorUserItemDto {
  user_id: string;
  tier: string;
  signed_up_at: string;
  market: string;
  interest_count: number;
  plays_30d: number;
  listen_sec_30d: number;
  completes_30d: number;
  last_played_at: string | null;
}

/**
 * 추천 검증 후보 사용자 목록 — **`user_id`와 행동 수치만** 싣는다(이름·이메일은 서버가 조회하지도 싣지도 않는다).
 * 콘솔은 `user_id` 앞 8자리로만 보인다.
 */
export class RecommendInspectorUsersResponseDto {
  readonly sort: InspectorUserSort;
  readonly since: string;
  readonly generated_at: string;
  readonly users: InspectorUserItemDto[];

  static from(
    sort: InspectorUserSort,
    result: { since: Date; users: InspectorUserRow[] },
    now: Date,
  ): RecommendInspectorUsersResponseDto {
    return {
      sort,
      since: result.since.toISOString(),
      generated_at: now.toISOString(),
      users: result.users.map((u) => ({
        user_id: u.userId,
        tier: u.tier,
        signed_up_at: u.signedUpAt.toISOString(),
        market: u.market,
        interest_count: u.interestCount,
        plays_30d: u.plays30d,
        listen_sec_30d: u.listenSec30d,
        completes_30d: u.completes30d,
        last_played_at: u.lastPlayedAt?.toISOString() ?? null,
      })),
    };
  }
}
