import { apiClient } from '@/shared/api/api-client';

import { toPlayLimitSnapshot } from '@/features/player';

import { IS_EXPLORE_API_MOCKED } from '../explore.constants';
import type {
  ExploreContentsPage,
  ExploreFeed,
  ExploreItem,
  ExplorePeriod,
  ExplorePopularPage,
  ExploreTopic,
  SaveContentResult,
  SaveReason,
} from '../explore.types';
import type {
  ExploreContentsResponseDto,
  ExploreFeedResponseDto,
  ExploreItemDto,
  ExplorePopularResponseDto,
  ExploreTopicsResponseDto,
  SaveContentResponseDto,
  UnsaveContentResponseDto,
} from './explore.dto';
import {
  mockFetchContents,
  mockFetchFeed,
  mockFetchPopular,
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
  /** 구간별로 키가 갈린다 — 커서가 구간을 넘어 이어지지 않게 하는 구조적 방어다(explore-api.md 4.2-1) */
  popular: (period: ExplorePeriod | null) => [...exploreKeys.all, 'popular', period] as const,
  topics: () => [...exploreKeys.all, 'topics'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toExploreItem = (dto: ExploreItemDto): ExploreItem => ({
  content: {
    id: dto.content.id,
    title: dto.content.title,
    authorName: dto.content.author_name,
    sourceName: dto.content.source_name,
    sourceUrl: dto.content.source_url,
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
    // 계약의 key를 화면 타입에서는 sectionKey로 옮긴다 — RN SectionList의 예약 필드와 겹치지 않게
    sectionKey: section.key,
    title: section.title,
    topic: section.topic,
    period: section.period ?? null,
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

const toPopularPage = (dto: ExplorePopularResponseDto): ExplorePopularPage => ({
  period: dto.period,
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
 * 인기 콘텐츠 목록(explore-api.md 4.2-1) — 구간 토글·추가 로딩만 호출하고 피드는 다시 부르지 않는다.
 * 첫 진입은 이 호출을 하지 않는다 — 기본 구간 목록은 피드 응답의 popular 섹션에 이미 들어 있다.
 * period는 토글이 고른 값을 그대로 보낸다(기본 구간의 소유자는 서버 — 클라이언트 상수를 두지 않는다).
 */
export const fetchExplorePopular = async (input: {
  period: ExplorePeriod;
  cursor?: string;
}): Promise<ExplorePopularPage> => {
  const params: Record<string, string> = { period: input.period };
  if (input.cursor !== undefined) params.cursor = input.cursor;

  const data = IS_EXPLORE_API_MOCKED
    ? await mockFetchPopular({ period: input.period, cursor: input.cursor })
    : (await apiClient.get<ExplorePopularResponseDto>('/explore/popular', { params })).data;
  return toPopularPage(data);
};

/**
 * 주제 칩 목록(explore-api.md 4.2-2) — 탐색 탭 진입 시 한 번 조회한다.
 * 정렬은 서버 소유다(관심 주제가 앞쪽) — 클라이언트는 순서를 재배열하지 않는다.
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
}): Promise<SaveContentResult> => {
  const body = { client_seq: input.clientSeq, reason: input.reason ?? 'user_save' };
  const data = IS_EXPLORE_API_MOCKED
    ? await mockSaveContent(input.contentId, body)
    : (
        await apiClient.post<SaveContentResponseDto>(`/contents/${input.contentId}/save`, body)
      ).data;
  return {
    clientSeq: data.client_seq,
    // 버튼 전환·삭제 호출 재료 — 상세 화면이 응답의 library_item.id를 보관한다(content-detail-api.md 4.2)
    libraryItem: {
      itemId: data.library_item.id,
      source: data.library_item.source,
      status: data.library_item.status,
      addedAt: data.library_item.added_at,
    },
  };
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
