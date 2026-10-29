import { ContentLanguage } from '@/modules/content/content.enum';

import { ContentReviewPromptView } from '../content-review.types';
import {
  RewardProgressDto,
  toRewardProgressDto,
} from './content-review-view.dto';

/** `GET /users/me/content-review/prompt` (content-review-api.md 4.3) */
export class ContentReviewPromptResponseDto {
  readonly enabled: boolean;
  readonly show: boolean;
  readonly item: {
    content_id: string;
    title: string;
    thumbnail_url: string;
    language: ContentLanguage;
    completed_date: string;
  } | null;
  readonly reward_progress: RewardProgressDto | null;
  readonly muted_until: string | null;

  static from(view: ContentReviewPromptView): ContentReviewPromptResponseDto {
    return {
      enabled: view.enabled,
      show: view.show,
      item: view.item
        ? {
            content_id: view.item.contentId,
            title: view.item.title,
            thumbnail_url: view.item.thumbnailUrl,
            language: view.item.language,
            completed_date: view.item.completedDate,
          }
        : null,
      reward_progress: toRewardProgressDto(view.rewardProgress),
      muted_until: view.mutedUntil,
    };
  }
}
