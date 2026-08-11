import { CareerView } from '../user.types';

/**
 * career-api.md 4.2 — 저장된 값을 그대로 반환한다(정규화 결과 포함 — 공백만 보낸
 * `job_title`은 `null`로 돌아온다). 클라이언트는 이 값으로 폼 상태를 확정한다.
 */
export class ReplaceCareerResponseDto {
  readonly job_category: string | null;
  readonly job_title: string | null;
  readonly years_of_experience: string | null;

  static from(view: CareerView): ReplaceCareerResponseDto {
    return {
      job_category: view.jobCategory,
      job_title: view.jobTitle,
      years_of_experience: view.yearsOfExperience,
    };
  }
}
