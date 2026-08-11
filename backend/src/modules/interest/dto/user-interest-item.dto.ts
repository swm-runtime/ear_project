import { UserInterestSelectionView } from '../interest.types';

/**
 * interest-management-api.md 4.2 — 관심사 항목. **주제명을 담지 않는다.** 이름·순서는
 * 주제 목록(`GET /onboarding/topics`)이 소유하며 클라이언트가 `topic_id`로 조인한다.
 * `source`는 원값 전달이고 배지 매핑은 화면이 한다.
 */
export class UserInterestItemDto {
  readonly topic_id: string;
  readonly source: string;

  static from(view: UserInterestSelectionView): UserInterestItemDto {
    return { topic_id: view.topicId, source: view.source };
  }
}
