import { apiClient } from '@/shared/api/api-client';

import { toPlayLimitSnapshot } from '@/features/player';

import { IS_LIBRARY_API_MOCKED } from '../library.constants';
import type {
  LibraryFilter,
  LibraryItem,
  LibraryPage,
  LibraryProgress,
  LibrarySourceFilter,
  LibraryTopic,
  ResumeResult,
} from '../library.types';
import type {
  CompleteResponseDto,
  LibraryItemDto,
  LibraryItemsResponseDto,
  LibraryProgressDto,
  LibraryTopicsResponseDto,
  ResumeResponseDto,
  RestoreResponseDto,
} from './library.dto';
import {
  mockComplete,
  mockDelete,
  mockFetchItems,
  mockFetchResume,
  mockFetchTopics,
  mockRestore,
} from './library.mock';

/* ── Query Key factory(convention.md 4.1) ── */

export const libraryKeys = {
  all: ['library'] as const,
  items: (filter: LibraryFilter, topicIds: string[], sourceFilter: LibrarySourceFilter | null) =>
    [...libraryKeys.all, 'items', filter, sourceFilter ?? 'any', [...topicIds].sort()] as const,
  topics: () => [...libraryKeys.all, 'topics'] as const,
  resume: () => [...libraryKeys.all, 'resume'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다.
      잔여 표시값 세 필드만 예외로 player의 공용 변환을 쓴다(library-api.md 2 — 공통 규약) ── */

const toProgress = (dto: LibraryProgressDto | null): LibraryProgress | null =>
  dto ? { positionSec: dto.position_sec, maxReachedSec: dto.max_reached_sec } : null;

const toLibraryItem = (dto: LibraryItemDto): LibraryItem => ({
  id: dto.id,
  source: dto.source,
  status: dto.status,
  addedAt: dto.added_at,
  lastPlayedAt: dto.last_played_at,
  completedAt: dto.completed_at,
  isCountedToday: dto.is_counted_today,
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
  progress: toProgress(dto.progress),
});

const toLibraryPage = (dto: LibraryItemsResponseDto): LibraryPage => ({
  items: dto.items.map(toLibraryItem),
  nextCursor: dto.next_cursor,
  hasNext: dto.has_next,
  playLimit: toPlayLimitSnapshot(dto),
});

const toResumeResult = (dto: ResumeResponseDto): ResumeResult => ({
  resumeTarget: dto.resume_target
    ? {
        id: dto.resume_target.id,
        status: dto.resume_target.status,
        lastPlayedAt: dto.resume_target.last_played_at,
        isCountedToday: dto.resume_target.is_counted_today,
        content: {
          id: dto.resume_target.content.id,
          title: dto.resume_target.content.title,
          durationSec: dto.resume_target.content.duration_sec,
          thumbnailUrl: dto.resume_target.content.thumbnail_url,
          contentVersion: dto.resume_target.content.content_version,
        },
        progress: toProgress(dto.resume_target.progress),
      }
    : null,
  playLimit: toPlayLimitSnapshot(dto),
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/** 목록 조회(library-api.md 4.1) — 진입·새로고침·포그라운드 복귀·추가 로딩이 전부 이 하나다 */
export const fetchLibraryItems = async (input: {
  filter: LibraryFilter;
  topicIds: string[];
  sourceFilter: LibrarySourceFilter | null;
  cursor?: string;
}): Promise<LibraryPage> => {
  const params: Record<string, string> = { filter: input.filter };
  if (input.topicIds.length > 0) params.topic_filter = input.topicIds.join(',');
  if (input.sourceFilter !== null) params.source_filter = input.sourceFilter;
  if (input.cursor !== undefined) params.cursor = input.cursor;

  const data = IS_LIBRARY_API_MOCKED
    ? await mockFetchItems({
        filter: input.filter,
        topic_filter: params.topic_filter,
        source_filter: input.sourceFilter ?? undefined,
        cursor: input.cursor,
      })
    : (await apiClient.get<LibraryItemsResponseDto>('/users/me/library-items', { params })).data;
  return toLibraryPage(data);
};

/** 주제 필터 팝업용 — 라이브러리에 실제로 담긴 주제(library-api.md 4.2) */
export const fetchLibraryTopics = async (): Promise<LibraryTopic[]> => {
  const data = IS_LIBRARY_API_MOCKED
    ? await mockFetchTopics()
    : (await apiClient.get<LibraryTopicsResponseDto>('/users/me/library-items/topics')).data;
  return data.topics.map((t) => ({ id: t.id, name: t.name, itemCount: t.item_count }));
};

/** 미니플레이어 복원 대상(library-api.md 4.3) — 표시 대상 조회일 뿐 재생 허가가 아니다 */
export const fetchResumeTarget = async (): Promise<ResumeResult> => {
  const data = IS_LIBRARY_API_MOCKED
    ? await mockFetchResume()
    : (await apiClient.get<ResumeResponseDto>('/users/me/library-items/resume')).data;
  return toResumeResult(data);
};

/**
 * 완청 처리(library-api.md 4.5) — 트리거일 뿐이며 서버가 max_reached_sec으로 다시 판정한다.
 * 호출자는 플레이어(player.md)다. 409(기준 미달)는 조용히 무시한다.
 */
export const completeLibraryItem = async (input: {
  itemId: string;
}): Promise<{ id: string; status: string; completedAt: string }> => {
  const data = IS_LIBRARY_API_MOCKED
    ? await mockComplete(input.itemId)
    : (
        await apiClient.post<CompleteResponseDto>(
          `/users/me/library-items/${input.itemId}/complete`,
        )
      ).data;
  return { id: data.id, status: data.status, completedAt: data.completed_at };
};

/** 소프트 삭제(library-api.md 4.6) — 스낵바가 사라진 뒤에 호출한다 */
export const deleteLibraryItem = async (input: { itemId: string }): Promise<void> => {
  if (IS_LIBRARY_API_MOCKED) {
    await mockDelete(input.itemId);
    return;
  }
  await apiClient.delete(`/users/me/library-items/${input.itemId}`);
};

/** 삭제 실행 취소(library-api.md 4.7) — added_at·status를 유지한 복구다 */
export const restoreLibraryItem = async (input: {
  itemId: string;
}): Promise<{ id: string; addedAt: string }> => {
  const data = IS_LIBRARY_API_MOCKED
    ? await mockRestore(input.itemId)
    : (await apiClient.post<RestoreResponseDto>(`/users/me/library-items/${input.itemId}/restore`))
        .data;
  return { id: data.id, addedAt: data.added_at };
};
