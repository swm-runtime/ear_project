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
    series: dto.content.series
      ? {
          seriesId: dto.content.series.series_id,
          episodeNo: dto.content.series.episode_no,
          totalEpisodes: dto.content.series.total_episodes,
        }
      : null,
    origin: dto.content.origin,
    authorName: dto.content.author_name,
    sourceName: dto.content.source_name,
    sourceUrl: dto.content.source_url,
    sources: dto.content.sources
      ? dto.content.sources.map((source) => ({
          title: source.title,
          author: source.author,
          url: source.url,
        }))
      : null,
  },
  libraryItem: dto.library_item
    ? {
        id: dto.library_item.id,
        source: dto.library_item.source,
        status: dto.library_item.status,
      }
    : null,
  isCountedToday: dto.is_counted_today,
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
