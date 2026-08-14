/**
 * 서버 계약 그대로의 DTO(snake_case) — profile-api.md 4장과 1:1이다.
 * 변환(to*)은 profile.api.ts 안에서만 일어난다(convention.md 5.2).
 */

export type ProfileProviderDto = 'kakao' | 'naver' | 'google';
export type PlanStatusDto = 'free' | 'subscribed' | 'cancel_scheduled' | 'grace';
export type YearsOfExperienceDto = '0-1' | '2-3' | '4-6' | '7+';
export type ProfileFailedSectionDto = 'plan' | 'interest_summary' | 'stats';

export interface ProfileUserDto {
  /** null 허용 — 제공자가 주지 않으면 비어 있다(domain.md 3.1: 가입 시 미정) */
  nickname: string | null;
  provider: ProfileProviderDto;
  /** null = 미등록. is_email_verified와 항상 함께 온다(profile-api.md 4.1) */
  email: string | null;
  is_email_verified: boolean;
}

export interface ProfilePlanDto {
  status: PlanStatusDto;
  tier: string;
  plan_name: string;
  daily_play_limit: number | null;
  renews_at: string | null;
  expires_at: string | null;
  has_payment_issue: boolean;
}

export interface ProfileTopicDto {
  id: string;
  name: string;
}

export interface InterestSummaryDto {
  count: number;
  top_topics: ProfileTopicDto[];
}

export interface ProfileCareerDto {
  job_category: string | null;
  job_title: string | null;
  years_of_experience: YearsOfExperienceDto | null;
}

export interface StatsSummaryDto {
  completed_content_count: number;
  total_listened_sec: number;
  streak_days: number;
}

/** 4.1의 weekly_listening과 4.2 응답이 같은 모양이다(profile-api.md 4.2) — 타입 하나로 쓴다 */
export interface WeeklyListeningDto {
  week_start: string;
  daily_listened_sec: number[];
  previous_week_start: string | null;
  next_week_start: string | null;
}

export interface TopicShareDto {
  topic_id: string;
  name: string;
  ratio: number;
}

export interface TopicDistributionDto {
  topics: TopicShareDto[];
  others_ratio: number;
}

/** GET /users/me/profile 응답(profile-api.md 4.1) — 섹션 null + failed_sections로 부분 실패 표현 */
export interface ProfileSummaryResponseDto {
  user: ProfileUserDto;
  plan: ProfilePlanDto | null;
  interest_summary: InterestSummaryDto | null;
  career: ProfileCareerDto;
  stats_summary: StatsSummaryDto | null;
  weekly_listening: WeeklyListeningDto | null;
  topic_distribution: TopicDistributionDto | null;
  failed_sections: ProfileFailedSectionDto[];
}

/** GET /users/me/profile/weekly-listening 응답(profile-api.md 4.2) */
export type WeeklyListeningResponseDto = WeeklyListeningDto;
