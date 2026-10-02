import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  DRIP_FEEDBACK_MAX_STARS,
  DRIP_FEEDBACK_MIN_STARS,
} from '../drip-feedback.constant';

class DripFeedbackRatingDto {
  @IsUUID('4')
  readonly content_id: string;

  @IsInt()
  @Min(DRIP_FEEDBACK_MIN_STARS)
  @Max(DRIP_FEEDBACK_MAX_STARS)
  readonly stars: number;
}

/** `POST /users/me/drip-feedback` (drip-feedback-api.md 4.2) */
export class RateDripFeedbackRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  // 같은 콘텐츠가 두 번 오면 한 INSERT 안에서 같은 행을 두 번 건드려 upsert 가 DB 오류(500)로 끝난다
  @ArrayUnique((rating: DripFeedbackRatingDto) => rating.content_id)
  @ValidateNested({ each: true })
  @Type(() => DripFeedbackRatingDto)
  readonly ratings: DripFeedbackRatingDto[];
}
