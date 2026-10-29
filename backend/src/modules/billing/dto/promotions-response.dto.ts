import {
  RewardProgressDto,
  toRewardProgressDto,
} from '@/modules/content-review/dto/content-review-view.dto';
import { InviteGrantDto } from '@/modules/subscription/dto/invite-grant.dto';

import { PromotionScreenView } from '../promotion.types';
import { PromotionDto } from './promotion.dto';

/** `GET /users/me/promotions` (content-review-api.md 4.6) — S12 [프로모션] */
export class PromotionsResponseDto {
  readonly enabled: boolean;
  /** 이용 중 — `plan.grant`와 같은 모양 · 같은 값 */
  readonly grant: InviteGrantDto | null;
  readonly promotions: PromotionDto[];
  /** 설정 [프로모션] 행의 점 배지 — 쓸 수 없는 것(`redeemable=false`)도 가진 것이다 */
  readonly has_unused: boolean;
  readonly reward_progress: RewardProgressDto | null;

  static from(view: PromotionScreenView): PromotionsResponseDto {
    return {
      enabled: view.enabled,
      grant: InviteGrantDto.from(view.grant),
      promotions: view.promotions.map((promotion) =>
        PromotionDto.from(promotion),
      ),
      has_unused: view.hasUnused,
      reward_progress: toRewardProgressDto(view.rewardProgress),
    };
  }
}
