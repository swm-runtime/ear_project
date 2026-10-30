import { ContentReviewView, RewardProgressView } from '../content-review.types';

/** 2.2 `review` */
export interface ContentReviewDto {
  stars: number;
  text: string | null;
  is_completed: boolean;
  content_version: number;
  created_at: string;
  updated_at: string;
}

/** 2.2 `reward_progress` */
export interface RewardProgressDto {
  current: number;
  required: number;
}

export function toContentReviewDto(view: ContentReviewView): ContentReviewDto {
  return {
    stars: view.stars,
    text: view.text,
    is_completed: view.isCompleted,
    content_version: view.contentVersion,
    created_at: view.createdAt.toISOString(),
    updated_at: view.updatedAt.toISOString(),
  };
}

export function toRewardProgressDto(
  view: RewardProgressView | null,
): RewardProgressDto | null {
  return view === null
    ? null
    : { current: view.current, required: view.required };
}
