import {
  ContentReviewDto,
  RewardProgressDto,
  toContentReviewDto,
  toRewardProgressDto,
} from '@/modules/content-review/dto/content-review-view.dto';

import { SaveContentReviewView } from '../promotion.types';
import { PromotionDto } from './promotion.dto';

/** `PUT /contents/:contentId/review` 응답 (content-review-api.md 4.2) */
export class SaveContentReviewResponseDto {
  readonly review: ContentReviewDto;
  /** 저장 뒤의 진행 — 이번에 발급됐으면 `null` */
  readonly reward_progress: RewardProgressDto | null;
  /** **이번 저장으로** 발급된 프로모션 — 없으면 `null`(응답 유실 뒤의 재전송도 `null`) */
  readonly issued_promotion: PromotionDto | null;

  static from(view: SaveContentReviewView): SaveContentReviewResponseDto {
    return {
      review: toContentReviewDto(view.review),
      reward_progress: toRewardProgressDto(view.rewardProgress),
      issued_promotion:
        view.issuedPromotion === null
          ? null
          : PromotionDto.from(view.issuedPromotion),
    };
  }
}
