/**
 * 서버 통신 DTO — content-detail-api.md 4.1의 응답을 snake_case 그대로 선언한다(convention.md 5.1).
 * camelCase 변환은 content-detail.api.ts 안에서만 일어난다.
 */
import type { LibraryItemStatus, LibrarySource } from '@/features/library';

export interface ContentDetailTopicDto {
  id: string;
  name: string;
}

/** 단일 콘텐츠는 객체째 null — 세 필드를 묶어 null 판정이 하나가 되게 한 모양(api 4.1) */
export interface ContentDetailSeriesDto {
  series_id: string;
  episode_no: number;
  total_episodes: number;
}

/**
 * ⚠️ 가정 계약 — 백엔드 티켓 미확정(tickets/backend/pending/content-sources-structured-list.md).
 * 티켓 확정 시 content-detail-api.md와 함께 이 DTO를 대조·갱신한다.
 */
export interface ContentDetailSourceDto {
  title: string;
  author: string | null;
  url: string | null;
}

export interface ContentDetailContentDto {
  id: string;
  title: string;
  description: string;
  duration_sec: number;
  published_at: string;
  thumbnail_url: string;
  content_version: number;
  topics: ContentDetailTopicDto[];
  series: ContentDetailSeriesDto | null;
  origin: 'partner' | 'ai_generated';
  author_name: string | null;
  source_name: string;
  source_url: string | null;
  /** ai_generated의 참고 소스 전수(⚠️ 가정 계약). partner는 null(api 9장 제안값) */
  sources: ContentDetailSourceDto[] | null;
}

/** GET /contents/:content_id (content-detail-api.md 4.1) */
export interface ContentDetailResponseDto {
  content: ContentDetailContentDto;
  /** null이면 미담김(살아 있는 행 없음) — 별도 is_saved 불리언을 두지 않는다 */
  library_item: { id: string; source: LibrarySource; status: LibraryItemStatus } | null;
  is_counted_today: boolean;
}
