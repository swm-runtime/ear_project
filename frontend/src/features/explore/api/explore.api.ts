import { track } from '@/shared/analytics';
import { apiClient } from '@/shared/api/api-client';
import { logger } from '@/shared/lib/logger';

import { toPlayLimitSnapshot } from '@/features/player';

import { IS_EXPLORE_API_MOCKED } from '../explore.constants';
import type {
  ExploreContent,
  ExploreContentsPage,
  ExploreEntry,
  ExploreFeed,
  ExploreItem,
  ExplorePeriod,
  ExplorePopularPage,
  ExploreSearchPage,
  ExploreTopic,
  SaveContentResult,
  SaveReason,
  SeriesDetail,
} from '../explore.types';
import type {
  ExploreContentDto,
  ExploreContentsResponseDto,
  ExploreEntryDto,
  ExploreFeedResponseDto,
  ExploreItemDto,
  ExploreSeriesCardDto,
  ExplorePopularResponseDto,
  ExploreSearchResponseDto,
  ExploreTopicsResponseDto,
  RelatedContentsResponseDto,
  SaveContentResponseDto,
  SeriesDetailResponseDto,
  UnsaveContentResponseDto,
} from './explore.dto';
import {
  mockFetchContents,
  mockFetchFeed,
  mockFetchPopular,
  mockFetchRelatedContents,
  mockFetchSearch,
  mockFetchSeriesDetail,
  mockFetchTopics,
  mockSaveContent,
  mockUnsaveContent,
} from './explore.mock';

/* ── Query Key factory(convention.md 4.1) ── */

export const exploreKeys = {
  all: ['explore'] as const,
  feed: () => [...exploreKeys.all, 'feed'] as const,
  contents: (topicIds: string[]) => [...exploreKeys.all, 'contents', [...topicIds].sort()] as const,
  /** 구간별로 키가 갈린다 — 커서가 구간을 넘어 이어지지 않게 하는 구조적 방어다(explore-api.md 4.2-1) */
  popular: (period: ExplorePeriod | null) => [...exploreKeys.all, 'popular', period] as const,
  topics: () => [...exploreKeys.all, 'topics'] as const,
  /**
   * 질의별로 키가 갈린다 — 연속 입력 중 늦게 도착한 이전 질의 응답이 최신 질의 화면을
   * 덮지 못하게 하는 구조적 방어다(explore.md 4.5-2). 화면은 현재 질의의 키만 구독한다.
   */
  search: (query: string, exact = false) =>
    [...exploreKeys.all, 'search', query, exact ? 'exact' : 'corrected'] as const,
  /**
   * 시리즈 화면(explore-api.md 4.7) — explore 아래에 둔다: 탐색의 재생·담기 뒤 `exploreKeys.all` 무효화가 시리즈 화면의
   * 편 상태(담음·완청·재생 위치)도 함께 최신화한다
   */
  series: (seriesId: string) => [...exploreKeys.all, 'series', seriesId] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toExploreContent = (dto: ExploreContentDto): ExploreContent => ({
  id: dto.id,
  title: dto.title,
  authorName: dto.author_name ?? '',
  sourceName: dto.source_name,
  sourceUrl: dto.source_url,
  durationSec: dto.duration_sec,
  thumbnailUrl: dto.thumbnail_url,
  contentVersion: dto.content_version,
  topicIds: dto.topic_ids,
  tags: dto.tags ?? [],
  language: dto.language ?? null,
  series: dto.series
    ? {
        id: dto.series.id,
        title: dto.series.title,
        episodeNo: dto.series.episode_no,
        totalEpisodes: dto.series.total_episodes,
      }
    : null,
});

const toExploreItem = (dto: ExploreItemDto): ExploreItem => ({
  type: 'content',
  content: toExploreContent(dto.content),
  library: dto.library
    ? { itemId: dto.library.item_id, source: dto.library.source, status: dto.library.status }
    : null,
  isCountedToday: dto.is_counted_today,
});

const toExploreSeriesItem = (dto: ExploreSeriesCardDto): ExploreEntry => ({
  type: 'series',
  series: {
    id: dto.series.id,
    title: dto.series.title,
    description: dto.series.description,
    totalEpisodes: dto.series.total_episodes,
    episodeCount: dto.series.episode_count,
    status: dto.series.status,
    thumbnailUrl: dto.series.thumbnail_url,
    topicIds: dto.series.topic_ids,
  },
});

/**
 * 섞인 목록의 항목 하나(explore-api.md 4.1-1) — `type` 이 없으면 콘텐츠 행이다(스위치가 꺼진 서버는 `type` 키를 보내지
 * 않는다). **모르는 `type` 은 null 로 버린다** — 서버가 무배포로 새 종류를 더해도 그 항목만 빠지고 목록이 깨지지 않게 한다
 * (계약 "모르는 type 은 건너뛴다"). 타입에 없는 값도 런타임엔 올 수 있어 문자열로 다시 읽는다
 */
export const toExploreEntry = (dto: ExploreEntryDto): ExploreEntry | null => {
  const type: unknown = (dto as { type?: unknown }).type;
  const entry =
    type === undefined || type === 'content'
      ? toExploreItem(dto as ExploreItemDto)
      : type === 'series'
        ? toExploreSeriesItem(dto as ExploreSeriesCardDto)
        : null;
  if (entry === null) {
    logger.debug('[explore] unknown entry type skipped', type);
    return null;
  }
  // 검색 응답의 엔진 표시(KAN-238) — 있을 때만 붙인다. 피드·주제별·인기 행에는 키 자체가 없다
  return dto.matched_by ? { ...entry, matchedBy: dto.matched_by } : entry;
};

const toExploreEntries = (dtos: ExploreEntryDto[]): ExploreEntry[] =>
  dtos.map(toExploreEntry).filter((entry): entry is ExploreEntry => entry !== null);

/** GET /series/:series_id(explore-api.md 4.7) — 편 순서는 서버 정렬(episode_no 오름차순) 그대로 둔다 */
export const toSeriesDetail = (dto: SeriesDetailResponseDto): SeriesDetail => ({
  series: {
    id: dto.series.id,
    title: dto.series.title,
    description: dto.series.description,
    totalEpisodes: dto.series.total_episodes,
    status: dto.series.status,
    thumbnailUrl: dto.series.thumbnail_url,
  },
  episodes: dto.episodes.map((episode) => ({
    episodeNo: episode.episode_no,
    item: toExploreItem({
      content: episode.content,
      library: episode.library,
      is_counted_today: episode.is_counted_today,
    }),
    progress: episode.progress
      ? {
          positionSec: episode.progress.position_sec,
          maxReachedSec: episode.progress.max_reached_sec,
        }
      : null,
  })),
});

const toExploreFeed = (dto: ExploreFeedResponseDto): ExploreFeed => ({
  sections: dto.sections.map((section) => ({
    // 계약의 key를 화면 타입에서는 sectionKey로 옮긴다 — RN SectionList의 예약 필드와 겹치지 않게
    sectionKey: section.key,
    title: section.title,
    topic: section.topic,
    period: section.period ?? null,
    items: toExploreEntries(section.items),
  })),
  playLimit: toPlayLimitSnapshot(dto),
});

const toContentsPage = (dto: ExploreContentsResponseDto): ExploreContentsPage => ({
  items: toExploreEntries(dto.items),
  nextCursor: dto.next_cursor,
  hasNext: dto.has_next,
  playLimit: toPlayLimitSnapshot(dto),
});

/**
 * 검색 페이지 — KAN-238 필드(`query_used`·`corrected_from`·`match`·`engines`·행의 `matched_by`)는 옛 서버가 보내지 않는다.
 * 없으면 "교정 없음·키워드 결과"로 읽어 종전 화면과 같게 그린다(explore-api.md 4.5 — 덧붙이는 필드만, 옛 앱·옛 서버 호환)
 */
const toSearchPage = (dto: ExploreSearchResponseDto): ExploreSearchPage => ({
  items: toExploreEntries(dto.items),
  nextCursor: dto.next_cursor,
  hasNext: dto.has_next,
  fallback: dto.fallback
    ? {
        relatedTopics: dto.fallback.related_topics,
        popularItems: toExploreEntries(dto.fallback.popular_items),
      }
    : null,
  queryUsed: dto.query_used ?? null,
  correctedFrom: dto.corrected_from ?? null,
  match: dto.match ?? 'keyword',
  engines: dto.engines ?? [],
});

const toPopularPage = (dto: ExplorePopularResponseDto): ExplorePopularPage => ({
  period: dto.period,
  items: toExploreEntries(dto.items),
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

/**
 * 키워드 검색(explore-api.md 4.5) — 트림 후 2자 이상·문자 포함 질의만 호출한다(호출 여부
 * 판정은 explore.search-query.ts — 클라이언트 필터는 UX이고 판정은 서버 방어선이다).
 * 응답에 잔여 표시값이 없다 — 검색 화면은 표시를 숨긴다(explore.md 4.4-1).
 */
export const fetchExploreSearch = async (input: {
  query: string;
  cursor?: string;
  /** 교정 끄기(KAN-239 "혹시 ‘OO’로 검색하고 싶나요?") — false 면 파라미터를 보내지 않는다(옛 서버에 모르는 키를 보내지 않게) */
  exact?: boolean;
}): Promise<ExploreSearchPage> => {
  const params: Record<string, string> = { query: input.query };
  if (input.cursor !== undefined) params.cursor = input.cursor;
  if (input.exact) params.exact = 'true';

  const data = IS_EXPLORE_API_MOCKED
    ? await mockFetchSearch({ query: input.query, cursor: input.cursor, exact: input.exact })
    : (await apiClient.get<ExploreSearchResponseDto>('/explore/search', { params })).data;
  return toSearchPage(data);
};

/**
 * 시리즈 화면(explore-api.md 4.7) — 탐색 시리즈 카드·상세의 시리즈 줄이 연다. 스위치와 무관하게 열려 있다.
 * 없는·다른 시장·노출 편 0개 시리즈는 404 `NOT_FOUND` 다 — 화면이 "시리즈를 찾을 수 없어요"로 받는다
 */
export const fetchSeriesDetail = async (input: { seriesId: string }): Promise<SeriesDetail> => {
  const data = IS_EXPLORE_API_MOCKED
    ? await mockFetchSeriesDetail(input.seriesId)
    : (await apiClient.get<SeriesDetailResponseDto>(`/series/${input.seriesId}`)).data;
  return toSeriesDetail(data);
};

/**
 * 관련 콘텍츠(player-api.md 4.8 — KAN-240) — 재생 목록 패널 "다음에 들어볼 만한"의 1차 소스. `exclude_ids`는 스냅샷에 이미 있는
 * 편(최대 50 — 넘으면 앞 50만 보낸다, 서버 400 을 내지 않게). 없는·다른 시장·회수 편은 404 `CONTENT_NOT_FOUND` — 호출자가 삼킨다
 */
export const fetchRelatedContents = async (input: {
  contentId: string;
  excludeIds: string[];
  limit?: number;
}): Promise<ExploreItem[]> => {
  const excludeIds = input.excludeIds.slice(0, RELATED_EXCLUDE_LIMIT);
  const params: Record<string, string> = {};
  if (input.limit !== undefined) params.limit = String(input.limit);
  if (excludeIds.length > 0) params.exclude_ids = excludeIds.join(',');
  const data = IS_EXPLORE_API_MOCKED
    ? await mockFetchRelatedContents({ contentId: input.contentId, excludeIds })
    : (
        await apiClient.get<RelatedContentsResponseDto>(`/contents/${input.contentId}/related`, {
          params,
        })
      ).data;
  return data.items.map(toExploreItem);
};
/** 서버 상한(player-api.md 4.8) */
const RELATED_EXCLUDE_LIMIT = 50;

/** 담기(explore-api.md 4.3) — 횟수 제한이 없고 페이월을 노출하지 않는다(PRD 5.4) */
export const saveContent = async (input: {
  contentId: string;
  clientSeq: number;
  reason?: SaveReason;
}): Promise<SaveContentResult> => {
  const body = { client_seq: input.clientSeq, reason: input.reason ?? 'user_save' };
  track('content_save', { content_id: input.contentId, entry: body.reason });
  const data = IS_EXPLORE_API_MOCKED
    ? await mockSaveContent(input.contentId, body)
    : (await apiClient.post<SaveContentResponseDto>(`/contents/${input.contentId}/save`, body))
        .data;
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
  track('content_remove', { content_id: input.contentId, entry: 'unsave', undone: false });
  const data = IS_EXPLORE_API_MOCKED
    ? await mockUnsaveContent(input.contentId, input.clientSeq)
    : (
        await apiClient.delete<UnsaveContentResponseDto>(`/contents/${input.contentId}/save`, {
          params: { client_seq: input.clientSeq },
        })
      ).data;
  return { clientSeq: data.client_seq };
};
