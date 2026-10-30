import { apiClient } from '@/shared/api/api-client';

import { IS_ONBOARDING_API_MOCKED } from '../onboarding.constants';
import type {
  CareerInfo,
  FirstDripState,
  OnboardingCompleteResult,
  OnboardingState,
  OnboardingStep,
  YearsOfExperience,
} from '../onboarding.types';
import type {
  CareerDto,
  CompleteResponseDto,
  FirstDripResponseDto,
  OnboardingStateDto,
  SaveCareerRequestDto,
  SaveCareerResponseDto,
  SaveInterestsRequestDto,
  SaveInterestsResponseDto,
} from './onboarding.dto';
import {
  mockComplete,
  mockFetchFirstDrip,
  mockFetchState,
  mockSaveCareer,
  mockSaveInterests,
} from './onboarding.mock';
import { normalizeOnboardingSteps } from '../services/onboarding-steps';

/* ── Query Key factory(convention.md 4.1) ── */

export const onboardingKeys = {
  all: ['onboarding'] as const,
  state: () => [...onboardingKeys.all, 'state'] as const,
  // 주제 목록 캐시는 interestKeys.topics()다 — 관심사 관리와 같은 목록·같은 캐시(architecture.md 4.4)
  firstDrip: () => [...onboardingKeys.all, 'first-drip'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toCareerInfo = (dto: CareerDto): CareerInfo => ({
  jobCategory: dto.job_category,
  jobTitle: dto.job_title,
  yearsOfExperience: dto.years_of_experience,
});

const toOnboardingState = (dto: OnboardingStateDto): OnboardingState => ({
  onboardingCompleted: dto.onboarding_completed,
  onboardingStep: dto.onboarding_step,
  steps: normalizeOnboardingSteps(dto.steps),
  selectedTopicIds: dto.selected_topic_ids,
  career: toCareerInfo(dto.career),
  pickedCount: dto.picked_count,
});

const toCompleteResult = (dto: CompleteResponseDto): OnboardingCompleteResult => ({
  onboardingCompleted: dto.onboarding_completed,
  onboardingStep: dto.onboarding_step,
  pickedCount: dto.picked_count,
  awaitsFirstDrip: dto.awaits_first_drip,
  firstDrip: dto.first_drip
    ? {
        status: dto.first_drip.status,
        pollIntervalSec: dto.first_drip.poll_interval_sec,
        maxWaitSec: dto.first_drip.max_wait_sec,
      }
    : null,
});

const toFirstDripState = (dto: FirstDripResponseDto): FirstDripState => ({
  status: dto.status,
  libraryItemCount: dto.library_item_count,
  completedAt: dto.completed_at,
  // 옛 서버(필드 없음)는 null 과 같다 — 탐색으로 폴백한다(experiments-api.md 4.1)
  firstContentId: dto.first_content_id ?? null,
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/** 재개 지점 조회(onboarding-api.md 4.1). 온보딩 화면이 직접 묻는 단일 소스다 */
export const fetchOnboardingState = async (): Promise<OnboardingState> => {
  const data = IS_ONBOARDING_API_MOCKED
    ? await mockFetchState()
    : (await apiClient.get<OnboardingStateDto>('/onboarding/state')).data;
  return toOnboardingState(data);
};

// 주제 목록 조회(GET /onboarding/topics)는 interest feature의 fetchTopics를 쓴다 —
// 관심사 관리와 공용 계약이라 선언·캐시를 한 곳에 둔다(interest-management-api.md 4.1).

/** 1단계 저장 — 전체 교체 PUT이라 멱등키가 필요 없다(onboarding-api.md 3장) */
export const saveInterests = async (input: {
  topicIds: string[];
}): Promise<{ selectedTopicIds: string[]; onboardingStep: OnboardingStep }> => {
  const body: SaveInterestsRequestDto = { topic_ids: input.topicIds };
  const data = IS_ONBOARDING_API_MOCKED
    ? await mockSaveInterests(input.topicIds)
    : (await apiClient.put<SaveInterestsResponseDto>('/onboarding/interests', body)).data;
  return { selectedTopicIds: data.selected_topic_ids, onboardingStep: data.onboarding_step };
};

/** 2단계 저장 — [건너뛰기]는 빈 본문으로 같은 엔드포인트를 호출한다(onboarding-api.md 4.4) */
export const saveCareer = async (input: {
  jobCategory?: string | null;
  jobTitle?: string | null;
  yearsOfExperience?: YearsOfExperience | null;
}): Promise<{ career: CareerInfo; onboardingStep: OnboardingStep }> => {
  const body: SaveCareerRequestDto = {};
  if (input.jobCategory !== undefined) body.job_category = input.jobCategory;
  if (input.jobTitle !== undefined) body.job_title = input.jobTitle;
  if (input.yearsOfExperience !== undefined) body.years_of_experience = input.yearsOfExperience;

  const data = IS_ONBOARDING_API_MOCKED
    ? await mockSaveCareer(body)
    : (await apiClient.patch<SaveCareerResponseDto>('/onboarding/career', body)).data;
  return { career: toCareerInfo(data.career), onboardingStep: data.onboarding_step };
};

/**
 * 완료 처리 + 첫 드립 트리거. 멱등키 필수(onboarding-api.md 4.7 ★).
 * 수동 재시도 간 같은 키를 재사용해야 하므로 호출자(completion service)가 키를 소유한다.
 */
export const completeOnboarding = async (input: {
  idempotencyKey: string;
}): Promise<OnboardingCompleteResult> => {
  const data = IS_ONBOARDING_API_MOCKED
    ? await mockComplete()
    : (
        await apiClient.post<CompleteResponseDto>(
          '/onboarding/complete',
          {},
          { idempotencyKey: input.idempotencyKey },
        )
      ).data;
  return toCompleteResult(data);
};

/** 0건 담기 경로의 대기 판정 조회(onboarding-api.md 4.8) */
export const fetchFirstDripState = async (): Promise<FirstDripState> => {
  const data = IS_ONBOARDING_API_MOCKED
    ? await mockFetchFirstDrip()
    : (await apiClient.get<FirstDripResponseDto>('/onboarding/first-drip')).data;
  return toFirstDripState(data);
};

// 기기 동기화(onboarding-api.md 4.9)는 notification feature로 이관됐다 —
// 온보딩·설정이 같은 엔드포인트를 쓴다(architecture.md 4.4). syncDevicePermission 참조.
