/**
 * DTO — onboarding-api.md 계약 그대로 snake_case로 선언한다(convention.md 1.6).
 * mock(onboarding.mock.ts)도 같은 DTO를 반환해 실서버 전환 시 변환 계층이 그대로 검증되게 한다.
 */
import type {
  FirstDripStatus,
  OnboardingStep,
  RecommendationSectionType,
  YearsOfExperience,
} from '../onboarding.types';

export interface CareerDto {
  job_category: string | null;
  job_title: string | null;
  years_of_experience: YearsOfExperience | null;
}

/** onboarding-api.md 4.1 */
export interface OnboardingStateDto {
  onboarding_completed: boolean;
  onboarding_step: OnboardingStep;
  selected_topic_ids: string[];
  career: CareerDto;
  picked_count: number;
}

// 주제 목록 DTO(onboarding-api.md 4.2)는 interest feature가 소유한다 — 관심사 관리와
// 공용 계약이라 선언을 한 곳에 둔다(architecture.md 4.4 — onboarding → interest).

/** onboarding-api.md 4.3 */
export interface SaveInterestsRequestDto {
  topic_ids: string[];
}

export interface SaveInterestsResponseDto {
  selected_topic_ids: string[];
  onboarding_step: OnboardingStep;
}

/** onboarding-api.md 4.4 — [건너뛰기]는 빈 본문이다 */
export interface SaveCareerRequestDto {
  job_category?: string | null;
  job_title?: string | null;
  years_of_experience?: YearsOfExperience | null;
}

export interface SaveCareerResponseDto {
  career: CareerDto;
  onboarding_step: OnboardingStep;
}

/** onboarding-api.md 4.5 */
export interface RecommendedContentDto {
  content_id: string;
  title: string;
  author_name: string;
  source_name: string;
  thumbnail_url: string;
  duration_sec: number;
  topics: { topic_id: string; name: string }[];
}

export interface RecommendationSectionDto {
  section_type: RecommendationSectionType;
  title: string;
  items: RecommendedContentDto[];
}

export interface RecommendationsResponseDto {
  sections: RecommendationSectionDto[];
}

/** onboarding-api.md 4.6 */
export interface SavePicksRequestDto {
  content_ids: string[];
}

export interface SavePicksResponseDto {
  saved_content_ids: string[];
  failed: { content_id: string; error_code: string }[];
  picked_count: number;
}

/** onboarding-api.md 4.7 */
export interface CompleteResponseDto {
  onboarding_completed: boolean;
  onboarding_step: OnboardingStep;
  onboarding_completed_at: string;
  picked_count: number;
  awaits_first_drip: boolean;
  first_drip: {
    status: FirstDripStatus;
    poll_interval_sec: number;
    max_wait_sec: number;
  } | null;
}

/** onboarding-api.md 4.8 */
export interface FirstDripResponseDto {
  status: FirstDripStatus;
  library_item_count: number | null;
  completed_at: string | null;
}

// 기기 동기화 DTO(onboarding-api.md 4.9)는 notification feature로 이관됐다(architecture.md 4.4)
