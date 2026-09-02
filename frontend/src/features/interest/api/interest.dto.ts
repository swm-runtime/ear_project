/**
 * DTO — interest-management-api.md 계약 그대로 snake_case로 선언한다(convention.md 1.6).
 * 주제 목록 계약의 소유는 onboarding-api.md 4.2이지만, 선언은 feature 의존 방향
 * (architecture.md 4.4 — onboarding → interest)에 따라 interest가 든다. 같은 엔드포인트의
 * DTO를 두 feature가 각자 선언하면 한쪽만 고쳐지는 순간 계약이 갈라진다.
 */
import type { InterestSource } from '../interest.types';

/** onboarding-api.md 4.2 — 온보딩 1단계와 공용 */
export interface TopicItemDto {
  topic_id: string;
  name: string;
  parent_category: string;
}

export interface TopicListResponseDto {
  items: TopicItemDto[];
  max_selectable: number;
  is_fallback: boolean;
}

/** interest-management-api.md 4.2 — 저장(4.3) 응답도 같은 모양이다 */
export interface UserInterestDto {
  topic_id: string;
  source: InterestSource;
}

export interface InterestsResponseDto {
  interests: UserInterestDto[];
}

/** interest-management-api.md 4.3 — 델타가 아니라 최종 목록 전체다(멱등 PUT) */
export interface SaveInterestsRequestDto {
  topic_ids: string[];
}
