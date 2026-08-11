import { apiClient } from '@/shared/api/api-client';

import { IS_CAREER_API_MOCKED } from '../career.constants';
import type { CareerInfo, JobCategory } from '../career.types';
import type {
  CareerResponseDto,
  JobCategoryListResponseDto,
  ReplaceCareerRequestDto,
} from './career.dto';
import { mockFetchJobCategories, mockFetchMyCareer, mockReplaceMyCareer } from './career.mock';

/* ── Query Key factory(convention.md 4.1) ── */

export const careerKeys = {
  all: ['career'] as const,
  mine: () => [...careerKeys.all, 'mine'] as const,
  /**
   * 직군 목록 — 온보딩 2단계와 커리어 정보 화면이 같은 목록·같은 캐시를 쓴다
   * (career-api.md 4.3 — 클라이언트 상수 금지. 온보딩의 교체는 티켓
   * onboarding-job-categories-server-list가 소유한다)
   */
  jobCategories: () => [...careerKeys.all, 'job-categories'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toCareerInfo = (dto: CareerResponseDto): CareerInfo => ({
  jobCategory: dto.job_category,
  jobTitle: dto.job_title,
  yearsOfExperience: dto.years_of_experience,
});

const toJobCategories = (dto: JobCategoryListResponseDto): JobCategory[] =>
  dto.items.map((item) => ({ name: item.name }));

const toReplaceCareerRequestDto = (model: CareerInfo): ReplaceCareerRequestDto => ({
  job_category: model.jobCategory,
  job_title: model.jobTitle,
  years_of_experience: model.yearsOfExperience,
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/** 커리어 현재 값 조회(career-api.md 4.1) — 미입력이면 세 null이 온다(404가 아니다) */
export const fetchMyCareer = async (): Promise<CareerInfo> => {
  const data = IS_CAREER_API_MOCKED
    ? await mockFetchMyCareer()
    : (await apiClient.get<CareerResponseDto>('/users/me/career')).data;
  return toCareerInfo(data);
};

/** 직군 목록 조회(career-api.md 4.3) — 화면 진입 시 커리어 조회와 병렬 호출한다(6장) */
export const fetchJobCategories = async (): Promise<JobCategory[]> => {
  const data = IS_CAREER_API_MOCKED
    ? await mockFetchJobCategories()
    : (await apiClient.get<JobCategoryListResponseDto>('/job-categories')).data;
  return toJobCategories(data);
};

/**
 * 커리어 저장(career-api.md 4.2) — 3필드 전체 교체 PUT이라 멱등키가 필요 없다.
 * 온보딩의 PATCH /onboarding/career와 공용이 아니다 — 그쪽은 onboarding_step 전진이
 * 붙은 상태 전이다(같은 문서 3장 설계 메모).
 */
export const saveMyCareer = async (input: CareerInfo): Promise<CareerInfo> => {
  const body = toReplaceCareerRequestDto(input);
  const data = IS_CAREER_API_MOCKED
    ? await mockReplaceMyCareer(body)
    : (await apiClient.put<CareerResponseDto>('/users/me/career', body)).data;
  return toCareerInfo(data);
};
