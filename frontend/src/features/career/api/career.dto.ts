/**
 * DTO — career-api.md 계약 그대로 snake_case로 선언한다(convention.md 1.6).
 * 직군 목록(GET /job-categories)의 계약 소유는 career-api.md 4.3이며, 온보딩 2단계도
 * 이 엔드포인트를 공용한다 — 선언은 이 feature 하나다(의존 방향: onboarding → career).
 */
import type { YearsOfExperienceRange } from '../career.types';

/** career-api.md 4.1 응답 — 미입력은 null이다(404가 아니다). 빈 문자열은 오지 않는다(서버 정규화) */
export interface CareerResponseDto {
  job_category: string | null;
  job_title: string | null;
  years_of_experience: YearsOfExperienceRange | null;
}

/**
 * career-api.md 4.2 요청 — **세 키가 모두 있어야 한다**(키 누락 = VALIDATION_FAILED).
 * 전체 교체 계약이라 비움은 키 생략이 아니라 null이다. 응답과 모양이 같아도 공유하지
 * 않는다(convention.md 5.2 — 서로 다른 속도로 변한다).
 */
export interface ReplaceCareerRequestDto {
  job_category: string | null;
  job_title: string | null;
  years_of_experience: YearsOfExperienceRange | null;
}

/** career-api.md 4.3 — name 하나가 표시·전송·저장 값이다. 배열 순서가 곧 노출 순서다 */
export interface JobCategoryItemDto {
  name: string;
}

export interface JobCategoryListResponseDto {
  items: JobCategoryItemDto[];
}
