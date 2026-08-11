import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/**
 * interest-management-api.md 4.3 — 편집 후 **최종 주제 목록 전체**를 보낸다(델타 아님·멱등).
 *
 * 도메인 상한을 여기서 검증하지 않는 이유: 상한이 상수 3이 아니라 **max(3, 저장 전 활성
 * 개수)** 라 DTO 상수로 표현할 수 없고, 0개는 `INTEREST_REQUIRED`, 초과는
 * `INTEREST_LIMIT_EXCEEDED`로 구분해 내려야 하는 계약이다. 개수 판정은
 * `UserInterestService`가 하고, DTO는 대량 쓰기를 막는 안전 상한만 강제한다
 * (interest-management-api.md 7장).
 */
export class ReplaceUserInterestsRequestDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  readonly topic_ids: string[];
}
