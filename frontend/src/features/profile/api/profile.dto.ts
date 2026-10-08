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
  /** 제공자 프로필 사진 URL. null이면 이니셜·아이콘 폴백(profile-api.md 4.1, 2026-09-16) */
  profile_image_url: string | null;
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
  /**
   * 가입 체험(profile-api.md 4.1 "`plan.trial`", 2026-10-03). 체험 중이 아니면 null.
   * 선택 필드로 둔다 — 필드를 아직 안 보내는 서버(운영 반영 전)에서는 없을 수 있고, 그때는 null로 읽는다
   */
  trial?: ProfilePlanTrialDto | null;
  /**
   * 예약된 요금제 변경(profile-api.md 4.1 "`plan.pending_plan`", 2026-10-08 KAN-161) — 다운그레이드 예약이면 다음 요금제와
   * 적용 시각, 없으면 null. 선택 필드 — 아직 안 보내는 서버에서는 없고, 그때는 null 로 읽는다
   */
  pending_plan?: { tier: string; plan_name: string; effective_at: string } | null;
}

export interface ProfilePlanTrialDto {
  /** 종료 시각(UTC, 05:00 KST 경계) — 표시에 쓰지 않는다. 날짜는 last_free_date */
  ends_at: string;
  /** 무제한으로 들을 수 있는 마지막 서비스 날짜(YYYY-MM-DD) — ends_at에서 계산하지 않는다 */
  last_free_date: string;
  /** 체험 뒤 하루 한도. null = 무제한(체험 중인 프로 구독자) */
  daily_play_limit_after: number | null;
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

export interface TopicShareDto {
  topic_id: string;
  name: string;
  ratio: number;
}

export interface TopicDistributionDto {
  topics: TopicShareDto[];
  others_ratio: number;
}

/** 4.1의 weekly_listening과 4.2 응답이 같은 모양이다(profile-api.md 4.2) — 타입 하나로 쓴다 */
export interface WeeklyListeningDto {
  week_start: string;
  daily_listened_sec: number[];
  previous_week_start: string | null;
  next_week_start: string | null;
  /**
   * 그 주의 주제 분포(비율만) — BE 요청 중(tickets/backend/pending/profile-weekly-topic-distribution.md).
   * 서버가 아직 안 보내면 없다 → 화면은 4.1 의 전체 기간 분포로 떨어진다
   */
  topic_distribution?: TopicDistributionDto;
  /**
   * 요일별 주제 분포 — 월~일 7개(막대를 탭하면 그날 분포, PM 2026-09-28 04:26). 같은 BE 요청(KAN-113)에 포함.
   * 없으면 막대를 탭해도 주 분포가 그대로다
   */
  daily_topic_distribution?: TopicDistributionDto[];
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
