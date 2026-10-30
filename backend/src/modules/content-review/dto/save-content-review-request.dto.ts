import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateBy,
  ValidationOptions,
} from 'class-validator';

import {
  CONTENT_REVIEW_MAX_STARS,
  CONTENT_REVIEW_MAX_TEXT,
  CONTENT_REVIEW_MIN_STARS,
} from '../content-review.constant';
import { codePointLength } from '../policies/content-review.policy';

/** 코드 포인트 수 상한 — `@MaxLength`는 UTF-16 단위라 이모지 하나를 2자로 센다 */
function MaxCodePoints(
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxCodePoints',
      constraints: [max],
      validator: {
        validate: (value: unknown) =>
          typeof value !== 'string' || codePointLength(value) <= max,
        defaultMessage: () => `text must be at most ${max} characters`,
      },
    },
    options,
  );
}

/** `PUT /contents/:contentId/review` (content-review-api.md 4.2) */
export class SaveContentReviewRequestDto {
  @IsInt()
  @Min(CONTENT_REVIEW_MIN_STARS)
  @Max(CONTENT_REVIEW_MAX_STARS)
  readonly stars: number;

  /**
   * 앞뒤 공백을 **뺀 뒤** 0~500자(코드 포인트). 빈 값 · `null` · 생략 = 글 없음. 넘으면 400 — 잘라 저장하지 않는다.
   * 공백 제거를 검증 앞에 두는 이유: 앞뒤 공백 때문에 500자를 넘은 글이 거절되면 안 된다(계약은 "뺀 뒤 500자").
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxCodePoints(CONTENT_REVIEW_MAX_TEXT)
  readonly text?: string | null;
}
