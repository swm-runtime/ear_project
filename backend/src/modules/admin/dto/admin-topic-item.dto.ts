import { AdminTopicView } from '../admin.types';

/** admin.md 5장 주제 관리 — 콘텐츠 건수는 집계값이다(domain.md 4.1 — B-7) */
export class AdminTopicItemDto {
  readonly id: string;
  readonly name: string;
  readonly parent_category: string;
  readonly is_visible: boolean;
  readonly display_order: number;
  readonly content_count: number;

  static from(view: AdminTopicView): AdminTopicItemDto {
    return {
      id: view.topic.id,
      name: view.topic.name,
      parent_category: view.topic.parentCategory,
      is_visible: view.topic.isVisible,
      display_order: view.topic.displayOrder,
      content_count: view.contentCount,
    };
  }
}

export class AdminTopicListResponseDto {
  readonly items: AdminTopicItemDto[];

  static from(views: AdminTopicView[]): AdminTopicListResponseDto {
    return { items: views.map((view) => AdminTopicItemDto.from(view)) };
  }
}
