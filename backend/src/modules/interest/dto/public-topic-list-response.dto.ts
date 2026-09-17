import { Topic } from '../entities/topic.entity';

export class PublicTopicDto {
  readonly name: string;
}

export class PublicTopicGroupDto {
  /** 대분류 이름(`topics.parent_category`) */
  readonly name: string;
  readonly topics: PublicTopicDto[];
}

/**
 * public-api.md 2.1 — 랜딩 페이지에 싣는 공개 주제 목록.
 *
 * **이름만 내보낸다.** id·정렬값·노출 여부 같은 운영 값은 로그인 없이 보이는 응답에 둘 이유가 없다.
 * 대분류 순서는 그 대분류에 속한 첫 주제의 `display_order` 순이다 — 대분류에는 정렬 컬럼이 없고,
 * 관리자 콘솔이 체계(대분류 순서)대로 `display_order`를 매긴다(topic-taxonomy-v2).
 */
export class PublicTopicListResponseDto {
  readonly groups: PublicTopicGroupDto[];

  /** `topics`는 `display_order` 오름차순으로 들어온다(`TopicService.findAllVisible`) */
  static from(topics: Topic[]): PublicTopicListResponseDto {
    const groups = new Map<string, PublicTopicDto[]>();

    for (const topic of topics) {
      const items = groups.get(topic.parentCategory) ?? [];
      items.push({ name: topic.name });
      groups.set(topic.parentCategory, items);
    }

    return {
      groups: [...groups].map(([name, items]) => ({ name, topics: items })),
    };
  }
}
