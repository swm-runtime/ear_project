import { apiClient } from '@/shared/api/api-client';

import { IS_INTEREST_API_MOCKED } from '../interest.constants';
import type { TopicList, UserInterest } from '../interest.types';
import type {
  InterestsResponseDto,
  SaveInterestsRequestDto,
  TopicListResponseDto,
} from './interest.dto';
import { mockFetchMyInterests, mockFetchTopics, mockSaveMyInterests } from './interest.mock';

/* ── Query Key factory(convention.md 4.1) ── */

export const interestKeys = {
  all: ['interest'] as const,
  /** 주제 목록 — 온보딩 1단계와 같은 목록·같은 캐시를 쓴다(interest-management-api.md 4.1) */
  topics: () => [...interestKeys.all, 'topics'] as const,
  mine: () => [...interestKeys.all, 'mine'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toTopicList = (dto: TopicListResponseDto): TopicList => ({
  items: dto.items.map((item) => ({
    topicId: item.topic_id,
    name: item.name,
    parentCategory: item.parent_category,
  })),
  maxSelectable: dto.max_selectable,
  isFallback: dto.is_fallback,
});

const toUserInterests = (dto: InterestsResponseDto): UserInterest[] =>
  dto.interests.map((item) => ({ topicId: item.topic_id, source: item.source }));

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/**
 * 주제 목록 — 엔드포인트를 새로 만들지 않고 온보딩과 공용한다(interest-management-api.md 3장.
 * 부작용 없는 순수 조회라 공용에 안전하다). 경로 이름은 온보딩 색을 띠지만 현행 유지가
 * 확정됐다(같은 문서 9장 — 협의 2026-08-10).
 */
export const fetchTopics = async (): Promise<TopicList> => {
  const data = IS_INTEREST_API_MOCKED
    ? await mockFetchTopics()
    : (await apiClient.get<TopicListResponseDto>('/onboarding/topics')).data;
  return toTopicList(data);
};

/** 현재 관심사 조회(interest-management-api.md 4.2) — 주제 목록과 병렬로 호출한다 */
export const fetchMyInterests = async (): Promise<UserInterest[]> => {
  const data = IS_INTEREST_API_MOCKED
    ? await mockFetchMyInterests()
    : (await apiClient.get<InterestsResponseDto>('/users/me/interests')).data;
  return toUserInterests(data);
};

/**
 * 일괄 저장(interest-management-api.md 4.3) — 최종 목록 전체를 보내는 전체 교체 PUT이라
 * 멱등키가 필요 없다. 온보딩의 PUT /onboarding/interests와 공용이 아니다 — 그쪽은
 * onboarding_step 전진이 붙은 상태 전이다(같은 문서 1장).
 */
export const saveMyInterests = async (input: { topicIds: string[] }): Promise<UserInterest[]> => {
  const body: SaveInterestsRequestDto = { topic_ids: input.topicIds };
  const data = IS_INTEREST_API_MOCKED
    ? await mockSaveMyInterests(input.topicIds)
    : (await apiClient.put<InterestsResponseDto>('/users/me/interests', body)).data;
  return toUserInterests(data);
};
