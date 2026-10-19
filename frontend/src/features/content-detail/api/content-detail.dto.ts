/**
 * 서버 통신 DTO — content-detail-api.md 4.1의 응답을 snake_case 그대로 선언한다(convention.md 5.1).
 * camelCase 변환은 content-detail.api.ts 안에서만 일어난다.
 */
import type { LibraryItemStatus, LibrarySource } from '@/features/library';

export interface ContentDetailTopicDto {
  id: string;
  name: string;
}

/**
 * 단일 콘텐츠는 객체째 null — 필드를 묶어 null 판정이 하나가 되게 한 모양(api 4.1).
 * KAN-134 1단계(2026-10-17)부터 `id`·`title` 이 붙는다 — `series_id` 는 `id` 와 같은 값이고 설치된 앱(1.2.1) 호환으로만 남는다.
 * 새 앱은 `id` 를 먼저 읽고, 아직 안 보내는 서버(구버전)를 위해 `series_id` 로 폴백한다. 셋 다 선택 필드로 둔다
 */
export interface ContentDetailSeriesDto {
  id?: string;
  /** 시리즈 이름 — 시리즈 줄 "{시리즈 제목} · N부작 중 M화"의 앞부분. 없으면(구버전 서버) 종전 문구 */
  title?: string;
  /** 종전 칸 — `id` 와 같은 값(설치된 앱 호환). 서버가 빼도 깨지지 않게 선택으로 둔다 */
  series_id?: string;
  episode_no: number;
  /** 이제 시리즈 표의 계획 편수다(domain.md 5.9) */
  total_episodes: number;
}

/**
 * 참고 소스 한 건(content-detail-api.md 4.1). 서버는 계속 보내지만 앱은 읽지 않는다 —
 * 상세 화면에서 출처 영역을 뺐다(KAN-221, 2026-10-17). 응답 모양 기록용으로만 남긴다.
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
  /** 화면 해시태그('#' 없이, 2~4개 — content-detail-api.md 4.1, KAN-162). 없으면 빈 배열. 아직 안 보내는 서버면 없다 */
  tags?: string[];
  /**
   * 콘텐츠 언어(BCP 47 primary — `ko` · `en`, global-api.md 4.7). **표시 전용** — 목록을 거르지 않는다(시장 필터는 서버 몫).
   * 아직 안 보내는 서버에서는 없다 — 없으면 null 로 읽는다
   */
  language?: string | null;
  series: ContentDetailSeriesDto | null;
  origin: 'partner' | 'ai_generated';
  author_name: string | null;
  source_name: string;
  source_url: string | null;
  /**
   * ai_generated의 참고 소스 전수. partner는 null(api 9장 제안값).
   * **앱은 읽지 않는 선택 필드다**(KAN-221) — 서버가 빼거나 바꿔도 화면이 깨지지 않게 optional로 둔다
   */
  sources?: ContentDetailSourceDto[] | null;
}

/** GET /contents/:content_id (content-detail-api.md 4.1) */
export interface ContentDetailResponseDto {
  content: ContentDetailContentDto;
  /** null이면 미담김(살아 있는 행 없음) — 별도 is_saved 불리언을 두지 않는다 */
  library_item: { id: string; source: LibrarySource; status: LibraryItemStatus } | null;
  is_counted_today: boolean;
}
