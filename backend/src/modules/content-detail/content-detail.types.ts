import { ContentSource } from '@/modules/content/entities/content-source.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { LibraryItem } from '@/modules/library/library-item.entity';

/** 헤더의 주제 태그 — `{id, name}` 객체 배열 (content-detail-api.md 9장 채택안) */
export interface ContentDetailTopicView {
  id: string;
  name: string;
}

/** 콘텐츠 단건 상세 응답의 조립 재료 (content-detail-api.md 4.1) */
export interface ContentDetailView {
  content: Content;
  topics: ContentDetailTopicView[];
  /** `ai_generated`만 배열이고 `partner`는 `null`이다 (확정 2026-08-24) */
  sources: ContentSource[] | null;
  /** `null`이면 미담김 — 버튼이 [담기]다 (content-detail.md 4.4) */
  libraryItem: LibraryItem | null;
  isCountedToday: boolean;
}
