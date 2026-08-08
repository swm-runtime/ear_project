/**
 * 서버 통신 DTO — library-api.md의 요청·응답을 snake_case 그대로 선언한다(convention.md 5.1).
 * camelCase 변환은 library.api.ts 안에서만 일어난다.
 */
import type { PlayLimitFieldsDto } from '@/features/player';

import type {
  LibraryFilter,
  LibraryItemStatus,
  LibrarySort,
  LibrarySource,
  LibrarySourceFilter,
} from '../library.types';

export interface LibraryContentDto {
  id: string;
  title: string;
  author_name: string;
  source_name: string;
  duration_sec: number;
  thumbnail_url: string;
  content_version: number;
  topic_ids: string[];
}

export interface LibraryProgressDto {
  position_sec: number;
  max_reached_sec: number;
}

export interface LibraryItemDto {
  id: string;
  source: LibrarySource;
  status: LibraryItemStatus;
  added_at: string;
  last_played_at: string | null;
  completed_at: string | null;
  is_counted_today: boolean;
  content: LibraryContentDto;
  progress: LibraryProgressDto | null;
}

/** GET /users/me/library-items (library-api.md 4.1) */
export interface LibraryItemsRequestDto {
  filter?: LibraryFilter;
  /** uuid 콤마 구분 */
  topic_filter?: string;
  /**
   * 출처 필터(FE 개편 2026-08-07). save는 source IN (save, onboarding)을 뜻한다.
   * TODO(계약 제안): library-api.md 미반영 — 백엔드 협의 필요. mock에만 구현되어 있다.
   */
  source_filter?: LibrarySourceFilter;
  sort?: LibrarySort;
  cursor?: string;
  limit?: number;
}

export interface LibraryItemsResponseDto extends PlayLimitFieldsDto {
  items: LibraryItemDto[];
  next_cursor: string | null;
  has_next: boolean;
}

/** GET /users/me/library-items/topics (library-api.md 4.2) */
export interface LibraryTopicsResponseDto {
  topics: { id: string; name: string; item_count: number }[];
}

export interface ResumeContentDto {
  id: string;
  title: string;
  duration_sec: number;
  thumbnail_url: string;
  content_version: number;
}

export interface ResumeTargetDto {
  id: string;
  status: LibraryItemStatus;
  last_played_at: string | null;
  is_counted_today: boolean;
  content: ResumeContentDto;
  progress: LibraryProgressDto | null;
}

/** GET /users/me/library-items/resume (library-api.md 4.3) — 대상 없음은 404가 아니라 null이다 */
export interface ResumeResponseDto extends PlayLimitFieldsDto {
  resume_target: ResumeTargetDto | null;
}

/** POST /users/me/library-items/:id/complete (library-api.md 4.5) */
export interface CompleteResponseDto {
  id: string;
  status: LibraryItemStatus;
  completed_at: string;
}

/** POST /users/me/library-items/:id/restore (library-api.md 4.7) */
export interface RestoreResponseDto {
  id: string;
  status: LibraryItemStatus;
  added_at: string;
  deleted_at: null;
}
