import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

import { PICK_CONTENT_LIMIT } from '../onboarding.constant';

/**
 * onboarding-api.md 4.6.
 *
 * 상한을 두는 이유: 담기는 화면에 노출된 9건 안에서만 일어난다. 상한이 없으면 한 요청으로
 * 카탈로그 전체를 적립시킬 수 있다(architecture.md 9.3).
 * 여기서의 위반은 계약대로 `VALIDATION_FAILED`(400)다.
 */
export class PickOnboardingContentsRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PICK_CONTENT_LIMIT)
  @IsUUID('4', { each: true })
  readonly content_ids: string[];
}
