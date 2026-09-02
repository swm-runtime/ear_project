import { LibraryTopicView } from '@/modules/library/library.types';

class LibraryTopicDto {
  readonly id: string;
  readonly name: string;
  readonly item_count: number;
}

/**
 * library-api.md 4.2 — 주제 필터 팝업이 무엇을 보여줄지.
 *
 * 담긴 항목이 하나도 없으면 `topics: []`다. **404가 아니다** — 빈 라이브러리는 정상 상태다.
 */
export class LibraryTopicListResponseDto {
  readonly topics: LibraryTopicDto[];

  static from(topics: LibraryTopicView[]): LibraryTopicListResponseDto {
    return {
      topics: topics.map((topic) => ({
        id: topic.topicId,
        name: topic.name,
        item_count: topic.itemCount,
      })),
    };
  }
}
