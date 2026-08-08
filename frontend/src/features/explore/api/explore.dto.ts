/**
 * 서버 통신 DTO — explore-api.md의 요청·응답을 snake_case 그대로 선언한다(convention.md 5.1).
 * camelCase 변환은 explore.api.ts 안에서만 일어난다.
 */
import type { LibraryItemStatus, LibrarySource } from '@/features/library';
import type { PlayLimitFieldsDto } from '@/features/player';

import type { ExplorePeriod } from '../explore.types';

export interface ExploreContentDto {
  id: string;
  title: string;
  author_name: string;
  source_name: string;
  duration_sec: number;
  thumbnail_url: string;
  content_version: number;
  topic_ids: string[];
}

export interface ExploreLibraryStateDto {
  item_id: string;
  source: LibrarySource;
  status: LibraryItemStatus;
}

export interface ExploreItemDto {
  content: ExploreContentDto;
  /** 없으면 null — 라이브러리에 담기지 않은 상태다(explore-api.md 4.1) */
  library: ExploreLibraryStateDto | null;
  is_counted_today: boolean;
}

export interface ExploreSectionDto {
  /** interest / new / popular / topic_group — 분석·로깅용. 화면 분기에 쓰지 않는다 */
  key: string;
  title: string;
  topic: { id: string; name: string } | null;
  /** popular 섹션만 값이 있다 — 구간 토글 선택 상태의 근거. 다른 섹션은 생략 또는 null(explore-api.md 4.1) */
  period?: ExplorePeriod | null;
  items: ExploreItemDto[];
}

/** GET /explore/feed (explore-api.md 4.1) */
export interface ExploreFeedResponseDto extends PlayLimitFieldsDto {
  sections: ExploreSectionDto[];
}

/** GET /explore/contents (explore-api.md 4.2) */
export interface ExploreContentsRequestDto {
  /** uuid 콤마 구분, 1개 이상 필수. 다중 선택은 OR 조합 */
  topic_ids: string;
  cursor?: string;
  limit?: number;
}

export interface ExploreContentsResponseDto extends PlayLimitFieldsDto {
  items: ExploreItemDto[];
  next_cursor: string | null;
  has_next: boolean;
}

/** GET /explore/popular (explore-api.md 4.2-1) — period 미전송이면 서버가 month로 해석한다 */
export interface ExplorePopularRequestDto {
  period?: ExplorePeriod;
  cursor?: string;
  limit?: number;
}

export interface ExplorePopularResponseDto extends PlayLimitFieldsDto {
  /** 서버가 되돌린 값 — 토글 선택 상태의 근거. 기본값을 클라이언트가 알 필요가 없게 한다 */
  period: ExplorePeriod;
  items: ExploreItemDto[];
  next_cursor: string | null;
  has_next: boolean;
}

/** POST /contents/:content_id/save (explore-api.md 4.3) */
export interface SaveContentRequestDto {
  /** 담기·해제 조작의 클라이언트 단조 증가 순번 — 서버는 저장·판정하지 않고 되돌린다 */
  client_seq: number;
  /** auto_play는 탐색 재생 자동 적립(4.6) — user_signals 적재 여부만 가른다 */
  reason?: 'user_save' | 'auto_play';
}

export interface SaveContentResponseDto extends PlayLimitFieldsDto {
  library_item: {
    id: string;
    source: LibrarySource;
    status: LibraryItemStatus;
    added_at: string;
  };
  client_seq: number;
}

/** DELETE /contents/:content_id/save (explore-api.md 4.4) */
export interface UnsaveContentResponseDto {
  client_seq: number;
}

/**
 * GET /explore/topics (explore-api.md 4.2-2) — 확정 계약(합의 2026-08-07).
 * 앞쪽은 활성 관심 주제 전부(선택 순서, 숨김 처리돼도 포함), 뒤쪽은 노출 주제(display_order 순).
 * 정렬은 서버 소유다 — 클라이언트는 재배열하지 않는다.
 */
export interface ExploreTopicsResponseDto {
  topics: { id: string; name: string; is_interest: boolean }[];
}
