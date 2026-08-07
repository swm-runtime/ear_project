import { apiClient } from '@/shared/api/api-client';

import { toPlayLimitSnapshot } from '@/features/player';

import { IS_EXPLORE_API_MOCKED } from '../explore.constants';
import type {
  ExploreContentsPage,
  ExploreFeed,
  ExploreItem,
  ExploreTopic,
  SaveReason,
} from '../explore.types';
import type {
  ExploreContentsResponseDto,
  ExploreFeedResponseDto,
  ExploreItemDto,
  ExploreTopicsResponseDto,
  SaveContentResponseDto,
  UnsaveContentResponseDto,
} from './explore.dto';
import {
  mockFetchContents,
  mockFetchFeed,
  mockFetchTopics,
  mockSaveContent,
  mockUnsaveContent,
} from './explore.mock';

/* ── Query Key factory(convention.md 4.1) ── */

export const exploreKeys = {
  all: ['explore'] as const,
  feed: () => [...exploreKeys.all, 'feed'] as const,
  contents: (topicIds: string[]) =>
    [...exploreKeys.all, 'contents', [...topicIds].sort()] as const,
  topics: () => [...exploreKeys.all, 'topics'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toExploreItem = (dto: ExploreItemDto): ExploreItem => ({
  content: {
    id: dto.content.id,
    title: dto.content.title,
    authorName: dto.content.author_name,
    sourceName: dto.content.source_name,
    durationSec: dto.content.duration_sec,
    thumbnailUrl: dto.content.thumbnail_url,
    contentVersion: dto.content.content_version,
    topicIds: dto.content.topic_ids,
  },
  library: dto.library
    ? { itemId: dto.library.item_id, source: dto.library.source, status: dto.library.status }
    : null,
  isCountedToday: dto.is_counted_today,
});

const toExploreFeed = (dto: ExploreFeedResponseDto): ExploreFeed => ({
  sections: dto.sections.map((section) => ({
    key: section.key,
    title: section.title,
    topic: section.topic,
    items: section.items.map(toExploreItem),
  })),
  playLimit: toPlayLimitSnapshot(dto),
});

const toContentsPage = (dto: ExploreContentsResponseDto): ExploreContentsPage => ({
  items: dto.items.map(toExploreItem),
  nextCursor: dto.next_cursor,
  hasNext: dto.has_next,
  playLimit: toPlayLimitSnapshot(dto),
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/** 섹션형 피드(explore-api.md 4.1) — 진입·새로고침·포그라운드/플레이어 복귀가 전부 이 하나다 */
export const fetchExploreFeed = async (): Promise<ExploreFeed> => {
  const data = IS_EXPLORE_API_MOCKED
    ? await mockFetchFeed()
    : (await apiClient.get<ExploreFeedResponseDto>('/explore/feed')).data;
  return toExploreFeed(data);
};

/** 주제 필터 단일 목록(explore-api.md 4.2) — 필터 선택·해제·추가 로딩이 호출한다 */
export const fetchExploreContents = async (input: {
  topicIds: string[];
  cursor?: string;
}): Promise<ExploreContentsPage> => {
  const params: Record<string, string> = { topic_ids: input.topicIds.join(',') };
  if (input.cursor !== undefined) params.cursor = input.cursor;

  const data = IS_EXPLORE_API_MOCKED
    ? await mockFetchContents({ topicIds: input.topicIds, cursor: input.cursor })
    : (await apiClient.get<ExploreContentsResponseDto>('/explore/contents', { params })).data;
  return toContentsPage(data);
};

/**
 * 주제 칩 목록 — 제안 계약(TODO: explore-api.md 미반영, 백엔드 협의 필요).
 * 관심 주제 우선 정렬은 서버 소유다(explore.md 4.2). 합의 전까지 실서버 전환 시 미구현 상태다.
 */
export const fetchExploreTopics = async (): Promise<ExploreTopic[]> => {
  const data = IS_EXPLORE_API_MOCKED
    ? await mockFetchTopics()
    : (await apiClient.get<ExploreTopicsResponseDto>('/explore/topics')).data;
  return data.topics.map((t) => ({ id: t.id, name: t.name, isInterest: t.is_interest }));
};

/** 담기(explore-api.md 4.3) — 횟수 제한이 없고 페이월을 노출하지 않는다(PRD 5.4) */
export const saveContent = async (input: {
  contentId: string;
  clientSeq: number;
  reason?: SaveReason;
}): Promise<{ clientSeq: number }> => {
  const body = { client_seq: input.clientSeq, reason: input.reason ?? 'user_save' };
  const data = IS_EXPLORE_API_MOCKED
    ? await mockSaveContent(input.contentId, body)
    : (
        await apiClient.post<SaveContentResponseDto>(`/contents/${input.contentId}/save`, body)
      ).data;
  return { clientSeq: data.client_seq };
};

/** 담기 해제(explore-api.md 4.4) — 라이브러리 삭제와 같은 결과(소프트 삭제 + 드립 영구 제외) */
export const unsaveContent = async (input: {
  contentId: string;
  clientSeq: number;
}): Promise<{ clientSeq: number }> => {
  const data = IS_EXPLORE_API_MOCKED
    ? await mockUnsaveContent(input.contentId, input.clientSeq)
    : (
        await apiClient.delete<UnsaveContentResponseDto>(`/contents/${input.contentId}/save`, {
          params: { client_seq: input.clientSeq },
        })
      ).data;
  return { clientSeq: data.client_seq };
};
