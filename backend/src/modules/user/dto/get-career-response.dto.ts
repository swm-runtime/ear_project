import { CareerView } from '../user.types';

/**
 * career-api.md 4.1 — 미입력은 세 `null`이다(404가 아니다 — 온보딩에서 건너뛴 사용자에게
 * 미입력은 정상 상태). 연차는 구간 라벨로 되돌려 내려준다.
 */
export class GetCareerResponseDto {
  readonly job_category: string | null;
  readonly job_title: string | null;
  readonly years_of_experience: string | null;

  static from(view: CareerView): GetCareerResponseDto {
    return {
      job_category: view.jobCategory,
      job_title: view.jobTitle,
      years_of_experience: view.yearsOfExperience,
    };
  }
}
