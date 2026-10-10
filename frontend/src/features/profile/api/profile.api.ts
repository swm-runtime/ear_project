import { queryOptions } from '@tanstack/react-query';

import { apiClient } from '@/shared/api/api-client';

import { IS_PROFILE_API_MOCKED } from '../profile.constants';
import type {
  PlanTrial,
  ProfileSummary,
  TopicDistribution,
  WeeklyListening,
} from '../profile.types';
import type {
  ProfilePlanTrialDto,
  ProfileSummaryResponseDto,
  TopicDistributionDto,
  WeeklyListeningDto,
  WeeklyListeningResponseDto,
} from './profile.dto';
import { mockFetchProfileSummary, mockFetchWeeklyListening } from './profile.mock';

/* ── Query Key factory(convention.md 4.1) ── */

export const profileKeys = {
  all: ['profile'] as const,
  summary: () => [...profileKeys.all, 'summary'] as const,
  weeklyAll: () => [...profileKeys.all, 'weekly'] as const,
  /** 주별로 키가 갈린다 — "한 번 받은 주는 재조회하지 않는다"의 캐시 단위(profile-api.md 4.2) */
  weekly: (weekStart: string) => [...profileKeys.weeklyAll(), weekStart] as const,
  /** 가입 체험 안내 팝업(P11)용 체험 값 — 요약 캐시(gcTime 0)와 키를 가른다. summary() 무효화에 딸려 다시 받지 않는다 */
  signupTrial: () => [...profileKeys.all, 'signup-trial'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toTopicDistribution = (dto: TopicDistributionDto): TopicDistribution => ({
  topics: dto.topics.map((topic) => ({
    topicId: topic.topic_id,
    name: topic.name,
    ratio: topic.ratio,
  })),
  othersRatio: dto.others_ratio,
});

const toWeeklyListening = (dto: WeeklyListeningDto): WeeklyListening => ({
  weekStart: dto.week_start,
  dailyListenedSec: dto.daily_listened_sec,
  previousWeekStart: dto.previous_week_start,
  nextWeekStart: dto.next_week_start,
  listeningTopPercent: dto.listening_top_percent ?? null,
  ...(dto.topic_distribution
    ? { topicDistribution: toTopicDistribution(dto.topic_distribution) }
    : {}),
  ...(dto.daily_topic_distribution?.length === 7
    ? { dailyTopicDistributions: dto.daily_topic_distribution.map(toTopicDistribution) }
    : {}),
});

/** 필드가 없으면(운영 반영 전 서버) 체험 아님으로 읽는다 */
export const toPlanTrial = (dto: ProfilePlanTrialDto | null | undefined): PlanTrial | null =>
  dto == null
    ? null
    : {
        endsAt: dto.ends_at,
        lastFreeDate: dto.last_free_date,
        dailyPlayLimitAfter: dto.daily_play_limit_after,
      };

const toProfileSummary = (dto: ProfileSummaryResponseDto): ProfileSummary => ({
  user: {
    nickname: dto.user.nickname,
    profileImageUrl: dto.user.profile_image_url,
    provider: dto.user.provider,
    email: dto.user.email,
    isEmailVerified: dto.user.is_email_verified,
  },
  plan:
    dto.plan === null
      ? null
      : {
          status: dto.plan.status,
          tier: dto.plan.tier,
          planName: dto.plan.plan_name,
          dailyPlayLimit: dto.plan.daily_play_limit,
          renewsAt: dto.plan.renews_at,
          expiresAt: dto.plan.expires_at,
          hasPaymentIssue: dto.plan.has_payment_issue,
          trial: toPlanTrial(dto.plan.trial),
          pendingPlan: dto.plan.pending_plan
            ? {
                planName: dto.plan.pending_plan.plan_name,
                effectiveAt: dto.plan.pending_plan.effective_at,
              }
            : null,
        },
  interestSummary:
    dto.interest_summary === null
      ? null
      : {
          count: dto.interest_summary.count,
          topTopics: dto.interest_summary.top_topics.map((topic) => ({
            id: topic.id,
            name: topic.name,
          })),
        },
  career: {
    jobCategory: dto.career.job_category,
    jobTitle: dto.career.job_title,
    yearsOfExperience: dto.career.years_of_experience,
  },
  statsSummary:
    dto.stats_summary === null
      ? null
      : {
          completedContentCount: dto.stats_summary.completed_content_count,
          totalListenedSec: dto.stats_summary.total_listened_sec,
          streakDays: dto.stats_summary.streak_days,
        },
  weeklyListening: dto.weekly_listening === null ? null : toWeeklyListening(dto.weekly_listening),
  topicDistribution:
    dto.topic_distribution === null ? null : toTopicDistribution(dto.topic_distribution),
  failedSections: dto.failed_sections,
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/** 프로필 요약(profile-api.md 4.1) — 탭 진입·편집 후 복귀·당겨서 새로고침·[다시 시도]가 전부 이 하나다 */
export const fetchProfileSummary = async (): Promise<ProfileSummary> => {
  const data = IS_PROFILE_API_MOCKED
    ? await mockFetchProfileSummary()
    : (await apiClient.get<ProfileSummaryResponseDto>('/users/me/profile')).data;
  return toProfileSummary(data);
};

/**
 * 가입 체험 값만(profile-api.md 4.1 "`plan.trial`") — P11 가입 체험 안내 팝업이 쓴다.
 * 가입 응답에는 날짜가 없어 세 조회(프로필·설정·구독) 중 하나에서 받는다 — 요약 계약을 그대로 재사용한다.
 * 플랜 섹션이 부분 실패(plan null)면 체험 아님으로 읽는다 — 팝업은 안 뜨고, 프로필 플랜 줄이 대신 알린다
 */
export const fetchSignupTrial = async (): Promise<PlanTrial | null> =>
  (await fetchProfileSummary()).plan?.trial ?? null;

/**
 * 이전 주차 주간 그래프(profile-api.md 4.2) — [◀ 이전 주] 탐색 시점에만 호출한다.
 * week_start는 직전 응답의 previous/next_week_start 토큰을 그대로 보낸다 — 클라이언트 날짜 연산 0.
 */
export const fetchWeeklyListening = async (input: {
  weekStart: string;
}): Promise<WeeklyListening> => {
  const data = IS_PROFILE_API_MOCKED
    ? await mockFetchWeeklyListening(input.weekStart)
    : (
        await apiClient.get<WeeklyListeningResponseDto>('/users/me/profile/weekly-listening', {
          params: { week_start: input.weekStart },
        })
      ).data;
  return toWeeklyListening(data);
};

/**
 * 주 이동 명령형 선조회용 옵션(useWeeklyNavigation이 fetchQuery·useQuery 양쪽에 쓴다).
 * staleTime Infinity — "한 번 받은 주는 화면을 벗어나기 전까지 재조회하지 않는다"(profile.md 4.6)를
 * 캐시 정책으로 표현한다. gcTime Infinity — 구독이 끊긴 주도 화면에 머무는 동안 유지한다.
 * 폐기는 화면 blur 시 removeQueries(weeklyAll()) 한 곳이 담당한다(useWeeklyNavigation).
 */
export const weeklyListeningQueryOptions = (weekStart: string) =>
  queryOptions({
    queryKey: profileKeys.weekly(weekStart),
    queryFn: () => fetchWeeklyListening({ weekStart }),
    staleTime: Infinity,
    gcTime: Infinity,
  });
