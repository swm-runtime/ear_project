import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/**
 * onboarding-api.md 4.3 — 선택한 주제 집합을 **전체 교체**한다.
 *
 * 도메인 상한(3개)을 여기서 검증하지 않는 이유: 상한 초과는
 * `ONBOARDING_INTEREST_LIMIT_EXCEEDED`, 0개는 `ONBOARDING_INTEREST_REQUIRED`로
 * **구분해서 내려야 하는 계약**인데, DTO 검증은 둘 다 `VALIDATION_FAILED`가 된다.
 * 따라서 개수 판정은 Service가 하고(`UserInterestService`), DTO는 대량 쓰기를 막는
 * 안전 상한만 강제한다(architecture.md 9.3).
 */
export class ReplaceOnboardingInterestsRequestDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  readonly topic_ids: string[];
}
