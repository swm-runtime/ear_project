import { TopicListResult } from '@/modules/interest/interest.types';

class OnboardingTopicItemDto {
  readonly topic_id: string;
  readonly name: string;
  readonly parent_category: string;
}

/** onboarding-api.md 4.2 */
export class GetOnboardingTopicsResponseDto {
  readonly items: OnboardingTopicItemDto[];
  /**
   * 선택 상한. **클라이언트에 상수로 두지 않는다** — 화면 문구와 서버 검증이 서로 다른
   * 상수를 보면, 상한을 조정할 때 한쪽만 바뀌어 사용자가 고를 수 있는 개수를 서버가 거부한다.
   */
  readonly max_selectable: number;
  /** 노출 주제가 없어 폴백을 내려보낸 상태. **정상 상태가 아니다** */
  readonly is_fallback: boolean;

  static from(result: TopicListResult): GetOnboardingTopicsResponseDto {
    return {
      items: result.topics.map((topic) => ({
        topic_id: topic.topicId,
        name: topic.name,
        parent_category: topic.parentCategory,
      })),
      max_selectable: result.maxSelectable,
      is_fallback: result.isFallback,
    };
  }
}
