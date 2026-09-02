import { RecommendationSectionType } from '../onboarding.enum';
import { RecommendationSection } from '../onboarding.types';

class RecommendationTopicDto {
  readonly topic_id: string;
  readonly name: string;
}

class RecommendationItemDto {
  readonly content_id: string;
  readonly title: string;
  /** `origin = ai_generated`는 null일 수 있다 (domain.md 5.1) */
  readonly author_name: string | null;
  readonly source_name: string;
  readonly thumbnail_url: string;
  readonly duration_sec: number;
  readonly topics: RecommendationTopicDto[];
}

class RecommendationSectionDto {
  /** 클라이언트는 **이 값으로** 모드를 분기한다. `title` 문자열로 판정하지 않는다 */
  readonly section_type: RecommendationSectionType;
  /** 화면에 그대로 노출할 제목. 랜덤 폴백 문구가 미확정이라 서버가 내려준다 */
  readonly title: string;
  readonly items: RecommendationItemDto[];
}

/** onboarding-api.md 4.5 */
export class GetOnboardingRecommendationsResponseDto {
  readonly sections: RecommendationSectionDto[];

  static from(
    sections: RecommendationSection[],
  ): GetOnboardingRecommendationsResponseDto {
    return {
      sections: sections.map((section) => ({
        section_type: section.sectionType,
        title: section.title,
        items: section.items.map((item) => ({
          content_id: item.contentId,
          title: item.title,
          author_name: item.authorName,
          source_name: item.sourceName,
          thumbnail_url: item.thumbnailUrl,
          duration_sec: item.durationSec,
          topics: item.topics.map((topic) => ({
            topic_id: topic.topicId,
            name: topic.name,
          })),
        })),
      })),
    };
  }
}
