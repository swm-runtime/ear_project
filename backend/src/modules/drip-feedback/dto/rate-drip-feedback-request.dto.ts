import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  @ValidateNested({ each: true })
  @Type(() => DripFeedbackRatingDto)
  readonly ratings: DripFeedbackRatingDto[];
}
