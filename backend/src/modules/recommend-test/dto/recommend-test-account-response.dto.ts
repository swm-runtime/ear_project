import { RecommendTestAccountView } from '../recommend-test.types';

/** `GET /admin/recommend-test/account` — 테스트 계정의 현재 상태. 점수·신호는 편성 미리보기(4.16)가 소유한다 */
export class RecommendTestAccountResponseDto {
  readonly environment: string;
  readonly user: {
    id: string;
    email: string | null;
    nickname: string | null;
    tier: string;
    onboarding_completed: boolean;
    job_category: string | null;
    job_title: string | null;
    years_of_experience: number | null;
  };
  readonly interests: {
    topic_id: string;
    name: string | null;
    source: string;
  }[];
  readonly library: {
    item_id: string;
    content_id: string;
    title: string | null;
    source: string;
    status: string;
    added_at: string;
    completed_at: string | null;
  }[];

  static from(view: RecommendTestAccountView): RecommendTestAccountResponseDto {
    return {
      environment: view.environment,
      user: {
        id: view.user.id,
        email: view.user.email,
        nickname: view.user.nickname,
        tier: view.user.tier,
        onboarding_completed: view.user.onboardingCompleted,
        job_category: view.user.jobCategory,
        job_title: view.user.jobTitle,
        years_of_experience: view.user.yearsOfExperience,
      },
      interests: view.interests.map((interest) => ({
        topic_id: interest.topicId,
        name: interest.name,
        source: interest.source,
      })),
      library: view.library.map((item) => ({
        item_id: item.id,
        content_id: item.contentId,
        title: item.content?.title ?? null,
        source: item.source,
        status: item.status,
        added_at: item.addedAt.toISOString(),
        completed_at: item.completedAt?.toISOString() ?? null,
      })),
    };
  }
}
