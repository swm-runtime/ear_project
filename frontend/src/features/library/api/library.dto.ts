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
  /** `origin = ai_generated`는 null일 수 있다(domain.md 5.1) — 서버 DTO와 같은 계약 */
  author_name: string | null;
  source_name: string;
  /**
   * L4 [원문 보기] 노출 근거(library.md 3장 — 확정 2026-08-10, null이면 미노출).
   * TODO(계약 제안): library-api.md 4.1 목록 행 미반영 — changes/pending 기록. mock에만 구현되어 있다.
   */
  source_url: string | null;
  duration_sec: number;
  thumbnail_url: string;
  content_version: number;
  topic_ids: string[];
  /**
   * 콘텐츠 언어(BCP 47 primary — `ko` · `en`, global-api.md 4.7). **표시 전용** — 목록을 거르지 않는다(시장 필터는 서버 몫).
   * 아직 안 보내는 서버에서는 없다 — 없으면 null 로 읽는다
   */
  language?: string | null;
  /** 이 사용자에게 잠긴 편인가(experiments-api.md 4.2-2 — KAN-294). 추가 필드라 옛 서버는 없다 → false */
  is_locked?: boolean;
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

/** PUT /users/me/library-items/queue-order (library-api.md 4.8) — 응답은 204, 본문 없음 */
export interface QueueOrderRequestDto {
  /** 보고 있는 목록의 library_items.id 를 위에서부터. 1~200개, 중복 불가 */
  item_ids: string[];
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
  /** 목록 응답(4.1)과 같은 출처·모양(2026-09-22 KAN-91). 주제 없으면 `[]` — 미니플레이어 카테고리 줄 */
  topic_ids: string[];
  /**
   * 콘텐츠 언어(BCP 47 primary — `ko` · `en`, global-api.md 4.7). **표시 전용** — 목록을 거르지 않는다(시장 필터는 서버 몫).
   * 아직 안 보내는 서버에서는 없다 — 없으면 null 로 읽는다
   */
  language?: string | null;
  /**
   * 이 사용자에게 잠긴 시리즈 편인가(experiments-api.md 4.2-2 — KAN-290). 표시·미리 막기 힌트일 뿐 판정은 서버가 재생 요청에서 한다.
   * 옛 서버는 보내지 않는다 — 없으면 false 로 읽는다
   */
  is_locked?: boolean;
}

export interface ResumeTargetDto {
  /** 담지 않고 듣던 편이면 null(library-api.md 4.3 — BE #1938) */
  id: string | null;
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

/* ── 추천 별점(drip-feedback-api.md — KAN-224). 요청·응답 DTO를 공유하지 않는다(convention.md 5.2) ── */

/** 4.1 `GET /users/me/drip-feedback/prompt` 응답의 한 편 */
export interface DripFeedbackPromptItemDto {
  content_id: string;
  title: string;
  thumbnail_url: string;
  /** `ko` | `en` — 표시 전용(2026-10-14) */
  language: 'ko' | 'en';
  source: LibrarySource;
  placed_date: string;
  /** 보조 표시용이지 판정이 아니다 */
  library_status: LibraryItemStatus;
}

/** 4.1 응답 — `show=false`면 `items`는 빈 배열, 물을 편성분이 없으면 `placed_date`는 null */
export interface DripFeedbackPromptResponseDto {
  show: boolean;
  placed_date: string | null;
  muted_until: string | null;
  items: DripFeedbackPromptItemDto[];
}

/** 4.2 `POST /users/me/drip-feedback` 요청 — 1~10건, 같은 content_id 중복 없음. 응답 204 */
export interface SubmitDripFeedbackRequestDto {
  ratings: { content_id: string; stars: number }[];
}

/** 4.3 `POST /users/me/drip-feedback/dismiss` 요청 — 4.1 응답의 placed_date 그대로. 응답 204 */
export interface DismissDripFeedbackRequestDto {
  placed_date: string;
}

/** 4.4 `POST /users/me/drip-feedback/mute` 응답(본문 없는 요청) — 다음 서비스 주 월요일 라벨 */
export interface MuteDripFeedbackResponseDto {
  muted_until: string;
}
