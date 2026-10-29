import { ContentStatus } from '@/modules/content/content.enum';
import { UserMarket } from '@/modules/user/user.enum';

import {
  AdminContentReviewSummary,
  AdminPromotionCounts,
  StarDistribution,
} from '../content-review.types';

/** `GET /admin/content-reviews/summary` (content-review-api.md 4.8) — **사용자 식별값을 싣지 않는다** */
export class AdminContentReviewSummaryResponseDto {
  readonly totals: {
    reviews: number;
    average_stars: number | null;
    text_reviews: number;
    reviewed_contents: number;
  };
  readonly promotions: AdminPromotionCounts;
  readonly items: {
    content_id: string;
    title: string;
    market: UserMarket;
    status: ContentStatus;
    content_version: number;
    reviews: number;
    average_stars: number | null;
    distribution: StarDistribution;
    text_reviews: number;
    completed_reviews: number;
    last_reviewed_at: string;
    by_version: {
      content_version: number;
      reviews: number;
      average_stars: number | null;
    }[];
  }[];

  static from(
    summary: AdminContentReviewSummary,
  ): AdminContentReviewSummaryResponseDto {
    return {
      totals: {
        reviews: summary.totals.reviews,
        average_stars: summary.totals.averageStars,
        text_reviews: summary.totals.textReviews,
        reviewed_contents: summary.totals.reviewedContents,
      },
      promotions: {
        issued: summary.promotions.issued,
        redeemed: summary.promotions.redeemed,
        expired: summary.promotions.expired,
        unused: summary.promotions.unused,
      },
      items: summary.items.map((item) => ({
        content_id: item.contentId,
        title: item.title,
        market: item.market,
        status: item.status,
        content_version: item.contentVersion,
        reviews: item.reviews,
        average_stars: item.averageStars,
        distribution: item.distribution,
        text_reviews: item.textReviews,
        completed_reviews: item.completedReviews,
        last_reviewed_at: item.lastReviewedAt.toISOString(),
        by_version: item.byVersion.map((version) => ({
          content_version: version.contentVersion,
          reviews: version.reviews,
          average_stars: version.averageStars,
        })),
      })),
    };
  }
}
