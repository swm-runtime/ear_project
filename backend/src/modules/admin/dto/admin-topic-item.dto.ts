import { AdminTopicView } from '../admin.types';

/** admin.md 5장 주제 관리 — 콘텐츠 건수는 집계값이다(domain.md 4.1 — B-7) */
export class AdminTopicItemDto {
  readonly id: string;
  readonly name: string;
  readonly parent_category: string;
  readonly is_visible: boolean;
  readonly display_order: number;
  readonly content_count: number;
  /**
   * 노출 가능한 콘텐츠 수(발행 중 + 라이선스 유효 — KAN-58). **노출 켜기는 이 값이 0이면 거부된다.**
   * `content_count`는 회수·만료분까지 센 값이라(삭제 판정용) 둘이 다를 수 있다 — 콘솔은 노출
   * 체크박스를 이 값으로 그린다
   */
  readonly visible_content_count: number;

  static from(view: AdminTopicView): AdminTopicItemDto {
    return {
      id: view.topic.id,
      name: view.topic.name,
      parent_category: view.topic.parentCategory,
      is_visible: view.topic.isVisible,
      display_order: view.topic.displayOrder,
      content_count: view.contentCount,
      visible_content_count: view.visibleContentCount,
    };
  }
}

export class AdminTopicListResponseDto {
  readonly items: AdminTopicItemDto[];

  static from(views: AdminTopicView[]): AdminTopicListResponseDto {
    return { items: views.map((view) => AdminTopicItemDto.from(view)) };
  }
}
