import { ContentReviewUnreviewableReason } from '../content-review.enum';
import { ContentReviewSheetView } from '../content-review.types';
import {
  ContentReviewDto,
  RewardProgressDto,
  toContentReviewDto,
  toRewardProgressDto,
} from './content-review-view.dto';

/** `GET /contents/:contentId/review` (content-review-api.md 4.1) */
export class ContentReviewSheetResponseDto {
  readonly enabled: boolean;
  readonly reviewable: boolean;
  readonly reason: ContentReviewUnreviewableReason | null;
  readonly review: ContentReviewDto | null;
  readonly reward_progress: RewardProgressDto | null;

  static from(view: ContentReviewSheetView): ContentReviewSheetResponseDto {
    return {
      enabled: view.enabled,
      reviewable: view.reviewable,
      reason: view.reason,
      review: view.review ? toContentReviewDto(view.review) : null,
      reward_progress: toRewardProgressDto(view.rewardProgress),
    };
  }
}
