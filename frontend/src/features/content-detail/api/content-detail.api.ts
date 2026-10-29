import { apiClient } from '@/shared/api/api-client';

import { IS_CONTENT_DETAIL_API_MOCKED } from '../content-detail.constants';
import type { ContentDetail } from '../content-detail.types';
import type { ContentDetailResponseDto } from './content-detail.dto';
import { mockFetchContentDetail } from './content-detail.mock';

/* ── Query Key factory(convention.md 4.1) ── */

export const contentDetailKeys = {
  all: ['content-detail'] as const,
  detail: (contentId: string) => [...contentDetailKeys.all, 'detail', contentId] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toContentDetail = (dto: ContentDetailResponseDto): ContentDetail => ({
  content: {
    id: dto.content.id,
    title: dto.content.title,
    description: dto.content.description,
    durationSec: dto.content.duration_sec,
    publishedAt: dto.content.published_at,
    thumbnailUrl: dto.content.thumbnail_url,
    contentVersion: dto.content.content_version,
    topics: dto.content.topics.map((topic) => ({ id: topic.id, name: topic.name })),
    tags: dto.content.tags ?? [],
    language: dto.content.language ?? null,
    // 새 `id`·`title` 을 먼저 읽고 종전 `series_id` 로 폴백한다(content-detail-api.md 4.1 — KAN-134 1단계)
    series: dto.content.series
      ? {
          seriesId: dto.content.series.id ?? dto.content.series.series_id ?? null,
          title: dto.content.series.title?.trim() ? dto.content.series.title : null,
          episodeNo: dto.content.series.episode_no,
          totalEpisodes: dto.content.series.total_episodes,
        }
      : null,
    origin: dto.content.origin,
    authorName: dto.content.author_name,
    sourceName: dto.content.source_name,
    sourceUrl: dto.content.source_url,
    // sources는 옮기지 않는다 — 상세가 출처를 그리지 않는다(KAN-221, content-detail.md 4.3)
  },
  libraryItem: dto.library_item
    ? {
        id: dto.library_item.id,
        source: dto.library_item.source,
        status: dto.library_item.status,
      }
    : null,
  isCountedToday: dto.is_counted_today,
  // 잠긴 편(KAN-294) — 최상위·콘텐츠 객체 어느 쪽이든 true 면 잠금. 옛 서버(둘 다 없음)는 false
  isLocked: dto.is_locked === true || dto.content.is_locked === true,
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/**
 * 콘텐츠 단건 상세 조회(content-detail-api.md 4.1) — 진입 시마다 호출한다.
 * 목록 응답을 재사용하지 않는다 — 최신 status·담김 여부 확인이 이 화면의 존재 이유다
 * (content-detail.md 4.1). 회수·만료는 403 CONTENT_WITHDRAWN으로 온다.
 */
export const fetchContentDetail = async (input: { contentId: string }): Promise<ContentDetail> => {
  const data = IS_CONTENT_DETAIL_API_MOCKED
    ? await mockFetchContentDetail(input.contentId)
    : (await apiClient.get<ContentDetailResponseDto>(`/contents/${input.contentId}`)).data;
  return toContentDetail(data);
};
