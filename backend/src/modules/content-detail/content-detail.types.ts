import { ContentSeriesRef } from '@/modules/content/content.types';
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
  /** 속한 시리즈(KAN-134). 단일 콘텐츠는 null — 응답 `content.series`도 null이다 */
  series: ContentSeriesRef | null;
  /** `null`이면 미담김 — 버튼이 [담기]다 (content-detail.md 4.4) */
  libraryItem: LibraryItem | null;
  /** 완청했는가 — 라이브러리 `completed` ∪ 재생 위치가 기준 이상(KAN-248). 담지 않고 끝까지 들은 편도 true */
  isCompleted: boolean;
  isCountedToday: boolean;
  /** 이 사용자에게 잠긴 시리즈 편인가(KAN-290). 재생 게이트와 같은 판정 */
  isLocked: boolean;
}
