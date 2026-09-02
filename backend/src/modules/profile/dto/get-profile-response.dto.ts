import { PlanStatus } from '@/modules/subscription/subscription.enum';
import { SocialProvider, UserTier } from '@/modules/user/user.enum';
import { YearsOfExperienceRange } from '@/modules/user/user.enum';

import { ProfileSection } from '../profile.enum';
import { ProfileSummaryResult } from '../profile.types';

import { WeeklyListeningResponseDto } from './weekly-listening-response.dto';

/** 헤더 — 표시 전용이다. 닉네임 편집·제공자 변경은 MVP 비범위(`profile.md` 미결) */
class ProfileUserDto {
  readonly nickname: string | null;
  readonly provider: SocialProvider;
  /**
   * **마스킹하지 않는다**(`profile-api.md` 7장). 본인 인증된 세션의 자기 정보이며,
   * 가리면 어떤 주소가 등록돼 있는지 몰라 변경 판단을 할 수 없다.
   */
  readonly email: string | null;
  readonly is_email_verified: boolean;
}

class ProfilePlanDto {
  readonly status: PlanStatus;
  readonly tier: UserTier;
  readonly plan_name: string;
  /** `null`은 무제한 티어. **"하루 N편"의 N은 이 서버 값이다 — 2를 하드코딩하지 않는다** */
  readonly daily_play_limit: number | null;
  /** 자동 갱신 중일 때의 다음 결제일 */
  readonly renews_at: string | null;
  /** 해지 예약·유예일 때의 이용 종료일 */
  readonly expires_at: string | null;
  readonly has_payment_issue: boolean;
}

class ProfileTopicDto {
  readonly id: string;
  readonly name: string;
}

class ProfileInterestSummaryDto {
  /** 관리자가 숨긴 주제도 개수에 포함한다 — 편집 화면과 같은 기준 */
  readonly count: number;
  /** 최대 3개. 별도 선정 기준 없이 서버 응답 순서의 앞 3개다 */
  readonly top_topics: ProfileTopicDto[];
}

/** 세 값 모두 선택 입력이라 미입력이면 `null`이다(`domain.md` 3.1 — 커리어는 `users`에 병합) */
class ProfileCareerDto {
  readonly job_category: string | null;
  readonly job_title: string | null;
  /** 저장은 int지만 계약은 **구간 라벨**이다(`career.md` 3장) */
  readonly years_of_experience: YearsOfExperienceRange | null;
}

class ProfileStatsSummaryDto {
  /** 완청한 **고유** 콘텐츠 수. 같은 콘텐츠를 여러 번 완청해도 1편 */
  readonly completed_content_count: number;
  /** 배속·반복과 무관한 **실제 들은 시간**(초) */
  readonly total_listened_sec: number;
  /** 연속 청취 일수. 오늘 아직 듣지 않았어도 어제까지 이어진 값을 그대로 내려준다 */
  readonly streak_days: number;
}

class TopicDistributionItemDto {
  readonly topic_id: string;
  readonly name: string;
  readonly ratio: number;
}

class TopicDistributionDto {
  /** 상위 5개(비율 내림차순). 5개 미만이면 있는 만큼만 */
  readonly topics: TopicDistributionItemDto[];
  /** 6위 이하를 묶은 비율. **"기타" 라벨 문자열은 내려주지 않는다** — 카피는 uiux 소유 */
  readonly others_ratio: number;
}

/**
 * profile-api.md 4.1 — 헤더 + 4개 카드 + 통계 3영역을 **한 번의 요청**으로.
 *
 * **`null`과 "값이 없음"을 혼동하지 않도록 `failed_sections`가 반드시 함께 온다.**
 * `email`이 `null`인 것(미등록), `career` 세 필드가 `null`인 것(미입력), 통계가 전부 0인 것
 * (기록 없음)은 전부 **정상**이며 실패가 아니다. 섹션 조회 실패만 필드 `null` +
 * `failed_sections`에 키가 담긴다.
 */
export class GetProfileResponseDto {
  readonly user: ProfileUserDto;
  readonly plan: ProfilePlanDto | null;
  readonly interest_summary: ProfileInterestSummaryDto | null;
  readonly career: ProfileCareerDto;
  readonly stats_summary: ProfileStatsSummaryDto | null;
  readonly weekly_listening: WeeklyListeningResponseDto | null;
  readonly topic_distribution: TopicDistributionDto | null;
  readonly failed_sections: ProfileSection[];

  static from(result: ProfileSummaryResult): GetProfileResponseDto {
    return {
      user: {
        nickname: result.user.nickname,
        provider: result.user.provider,
        email: result.user.email,
        is_email_verified: result.user.isEmailVerified,
      },
      plan: result.plan
        ? {
            status: result.plan.status,
            tier: result.plan.tier,
            plan_name: result.plan.planName,
            daily_play_limit: result.plan.dailyPlayLimit,
            renews_at: result.plan.renewsAt?.toISOString() ?? null,
            expires_at: result.plan.expiresAt?.toISOString() ?? null,
            has_payment_issue: result.plan.hasPaymentIssue,
          }
        : null,
      interest_summary: result.interestSummary
        ? {
            count: result.interestSummary.count,
            top_topics: result.interestSummary.topTopics.map((topic) => ({
              id: topic.id,
              name: topic.name,
            })),
          }
        : null,
      career: {
        job_category: result.career.jobCategory,
        job_title: result.career.jobTitle,
        years_of_experience: result.career.yearsOfExperience,
      },
      stats_summary: result.statsSummary
        ? {
            completed_content_count: result.statsSummary.completedContentCount,
            total_listened_sec: result.statsSummary.totalListenedSec,
            streak_days: result.statsSummary.streakDays,
          }
        : null,
      weekly_listening: result.weeklyListening
        ? WeeklyListeningResponseDto.from(result.weeklyListening)
        : null,
      topic_distribution: result.topicDistribution
        ? {
            topics: result.topicDistribution.topics.map((topic) => ({
              topic_id: topic.topicId,
              name: topic.name,
              ratio: topic.ratio,
            })),
            others_ratio: result.topicDistribution.othersRatio,
          }
        : null,
      failed_sections: result.failedSections,
    };
  }
}
