import { DripFeedbackVersionSummary } from '../drip-feedback.types';

/** `GET /admin/drip-feedback/versions` (admin-api.md 4.19) — 버전 역순 */
export class DripFeedbackVersionsResponseDto {
  readonly items: {
    algorithm_version: string | null;
    placements: number;
    placed_users: number;
    first_placed_at: string | null;
    last_placed_at: string | null;
    ratings: number;
    rated_users: number;
    average_stars: number | null;
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  }[];

  static from(
    summaries: DripFeedbackVersionSummary[],
  ): DripFeedbackVersionsResponseDto {
    return {
      items: summaries.map((summary) => ({
        algorithm_version: summary.algorithmVersion,
        placements: summary.placements,
        placed_users: summary.placedUsers,
        first_placed_at: summary.firstPlacedAt?.toISOString() ?? null,
        last_placed_at: summary.lastPlacedAt?.toISOString() ?? null,
        ratings: summary.ratings,
        rated_users: summary.ratedUsers,
        average_stars: summary.averageStars,
        distribution: summary.distribution,
      })),
    };
  }
}
