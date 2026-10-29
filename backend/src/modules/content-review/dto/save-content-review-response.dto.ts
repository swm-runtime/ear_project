import { SaveContentReviewResult } from '../content-review.service';
import {
  ContentReviewDto,
  RewardProgressDto,
  toContentReviewDto,
  toRewardProgressDto,
} from './content-review-view.dto';

/** `PUT /contents/:contentId/review` 응답 (content-review-api.md 4.2) */
export class SaveContentReviewResponseDto {
  readonly review: ContentReviewDto;
  readonly reward_progress: RewardProgressDto | null;
  /** 이번 저장으로 발급된 프로모션 — 없으면 `null` */
  readonly issued_promotion: null;

  static from(result: SaveContentReviewResult): SaveContentReviewResponseDto {
    return {
      review: toContentReviewDto(result.review),
      reward_progress: toRewardProgressDto(result.rewardProgress),
      issued_promotion: result.issuedPromotion,
    };
  }
}
