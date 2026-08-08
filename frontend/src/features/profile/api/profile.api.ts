import { queryOptions } from '@tanstack/react-query';

import { apiClient } from '@/shared/api/api-client';

import { IS_PROFILE_API_MOCKED } from '../profile.constants';
import type { ProfileSummary, WeeklyListening } from '../profile.types';
import type {
  ProfileSummaryResponseDto,
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
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toWeeklyListening = (dto: WeeklyListeningDto): WeeklyListening => ({
  weekStart: dto.week_start,
  dailyListenedSec: dto.daily_listened_sec,
  previousWeekStart: dto.previous_week_start,
  nextWeekStart: dto.next_week_start,
});

const toProfileSummary = (dto: ProfileSummaryResponseDto): ProfileSummary => ({
  user: {
    nickname: dto.user.nickname,
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
    dto.topic_distribution === null
      ? null
      : {
          topics: dto.topic_distribution.topics.map((topic) => ({
            topicId: topic.topic_id,
            name: topic.name,
            ratio: topic.ratio,
          })),
          othersRatio: dto.topic_distribution.others_ratio,
        },
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
