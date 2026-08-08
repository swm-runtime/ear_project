import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import {
  isWeekStartLabel,
  shiftWeekStart,
  toCurrentWeekStart,
  toServiceDate,
  toWeekDates,
} from '@/common/utils/service-date.util';
import { ContentService } from '@/modules/content/services/content.service';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { Subscription } from '@/modules/subscription/entities/subscription.entity';
import { SubscriptionStatus } from '@/modules/subscription/subscription.enum';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';
import { toYearsOfExperienceRange } from '@/modules/user/user.constant';
import { UserTier } from '@/modules/user/user.enum';

import { TOP_TOPIC_LIMIT } from './profile.constant';
import { PlanStatus, ProfileSection } from './profile.enum';
import {
  buildTopicDistribution,
  buildWeeklyBuckets,
  calculateStreakDays,
} from './profile.stats';
import {
  ProfileCareerView,
  ProfileInterestSummaryView,
  ProfilePlanView,
  ProfileStatsSummaryView,
  ProfileSummaryResult,
  ProfileUserView,
  TopicDistributionView,
  WeeklyListeningView,
} from './profile.types';

/**
 * architecture.md 3.3 — 여러 도메인 Service를 조합하는 유스케이스라 Orchestrator를 둔다.
 * **자기 Repository·Entity를 갖지 않는다**(`onboarding` · `library-screen` · `explore`와 같은 형태).
 *
 * 프로필 한 화면에 `users`(user), `subscriptions` · `plans`(subscription),
 * `user_interests` · `topics`(interest), `library_items`(library),
 * `play_records`(playback), `content_topics`(content)가 함께 들어간다. 어느 한 모듈의
 * Entity로 환원되지 않으므로 소유 모듈들 **위에서** 조합한다.
 *
 * **프로필은 서버에 쓰지 않는다**(`profile.md` 1장). 조회 전용이라 트랜잭션을 열지 않는다
 * (architecture.md 8.7 — 조회 API는 트랜잭션으로 감싸지 않는 것이 기본이다).
 */
@Injectable()
export class ProfileOrchestrator {
  private readonly logger = new Logger(ProfileOrchestrator.name);

  constructor(
    private readonly userService: UserService,
    private readonly subscriptionService: SubscriptionService,
    private readonly planService: PlanService,
    private readonly userInterestService: UserInterestService,
    private readonly topicService: TopicService,
    private readonly libraryService: LibraryService,
    private readonly playbackService: PlaybackService,
    private readonly contentService: ContentService,
  ) {}

  /**
   * profile-api.md 4.1 — 헤더 + 4개 카드 + 통계 3영역을 **한 번에** 조립한다.
   *
   * 카드마다 API를 나누지 않는 이유는 화면이 계속 흔들리기 때문이다(`profile.md` 3장).
   * 대신 **섹션 단위로 실패를 흡수한다** — 구독 조회가 죽었다고 관심사까지 못 보여줄 이유가 없다.
   *
   * `user`·`career`는 실패 대상이 아니다. 같은 `users` 행에서 오고, 그 조회가 실패하는 상황은
   * 사실상 인증 실패라 요청 전체가 실패하는 편이 정직하다(`profile-api.md` 4.1).
   */
  async getSummary(userId: string, now: Date): Promise<ProfileSummaryResult> {
    const user = await this.userService.getById(userId);
    const failedSections: ProfileSection[] = [];

    const [plan, interestSummary, stats] = await Promise.all([
      this.buildPlan(userId).catch((error: unknown) => {
        this.logSectionFailure(ProfileSection.PLAN, userId, error);
        failedSections.push(ProfileSection.PLAN);
        return null;
      }),
      this.buildInterestSummary(userId).catch((error: unknown) => {
        this.logSectionFailure(ProfileSection.INTEREST_SUMMARY, userId, error);
        failedSections.push(ProfileSection.INTEREST_SUMMARY);
        return null;
      }),
      this.buildStats(user, now).catch((error: unknown) => {
        this.logSectionFailure(ProfileSection.STATS, userId, error);
        failedSections.push(ProfileSection.STATS);
        return null;
      }),
    ]);

    return {
      user: toUserView(user),
      plan,
      interestSummary,
      career: toCareerView(user),
      statsSummary: stats?.summary ?? null,
      weeklyListening: stats?.weekly ?? null,
      topicDistribution: stats?.distribution ?? null,
      failedSections,
    };
  }

  /**
   * profile-api.md 4.2 — [◀ 이전 주] 탐색 시점에만 호출한다. 이번 주는 4.1 응답에 이미 있다.
   *
   * **`week_start`를 offset이 아니라 라벨로 받는다.** 응답의 `previous_week_start`를 그대로
   * 되돌려 보내는 구조라 클라이언트 날짜 연산이 0이 된다(4.2 설계 메모).
   */
  async getWeeklyListening(
    userId: string,
    weekStart: string,
    now: Date,
  ): Promise<WeeklyListeningView> {
    if (!isWeekStartLabel(weekStart)) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.VALIDATION_FAILED,
        message: '요청을 처리할 수 없어요',
        logLevel: 'warn',
      });
    }

    const user = await this.userService.getById(userId);

    return this.buildWeeklyListening(user, weekStart, now, { strict: true });
  }

  // --- 섹션별 조립 ---

  /**
   * 플랜 카드 — **`users.tier` 캐시가 아니라 `subscriptions`를 기준으로 조립한다**
   * (`profile-api.md` 3장 설계 메모 · domain.md 3.1).
   *
   * 캐시가 어긋나 있어도 여기서 고치지 않는다. 갱신 경로는 `SubscriptionService` 한 곳이며,
   * 조회가 캐시를 쓰기 시작하면 갱신 지점이 흩어진다.
   */
  private async buildPlan(userId: string): Promise<ProfilePlanView> {
    const subscription = await this.subscriptionService.findCurrent(userId);

    this.warnIfContradictoryCancellation(userId, subscription);

    const status = toPlanStatus(subscription);
    const tier =
      status === PlanStatus.FREE ? UserTier.LIGHT : subscription!.tier;
    const plan = await this.planService.findByTier(tier);

    return {
      status,
      tier,
      // 요금제 행이 없으면 티어값을 그대로 보여준다 — 카드가 빈 채로 나가는 것보다 낫다
      planName: plan?.name ?? tier,
      dailyPlayLimit: plan?.dailyPlayLimit ?? null,
      renewsAt:
        status === PlanStatus.SUBSCRIBED ? subscription!.expiresAt : null,
      expiresAt:
        status === PlanStatus.CANCEL_SCHEDULED || status === PlanStatus.GRACE
          ? subscription!.expiresAt
          : null,
      hasPaymentIssue: status === PlanStatus.GRACE,
    };
  }

  /**
   * 관심 주제 요약(`profile-api.md` 4.1).
   *
   * **숨김 주제(`topics.is_visible = false`)도 개수에 포함한다** — 편집 화면과 같은 기준을
   * 써야 개수가 어긋나지 않는다. 그래서 노출 주제 목록이 아니라 `findAllByIds`로 이름을 붙인다.
   *
   * `topTopics`는 **별도 선정 기준 없이 앞 3개**다(확정 2026-08-06).
   */
  private async buildInterestSummary(
    userId: string,
  ): Promise<ProfileInterestSummaryView> {
    const interests = await this.userInterestService.findAllActive(userId);
    const topics = await this.topicService.findAllByIds(
      interests.map((interest) => interest.topicId),
    );
    const byId = new Map(topics.map((topic) => [topic.id, topic]));

    const named = interests
      .map((interest) => byId.get(interest.topicId))
      .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic));

    return {
      // 이름을 못 붙인 주제도 사용자가 고른 것이므로 개수에서 빼지 않는다
      count: interests.length,
      topTopics: named
        .slice(0, TOP_TOPIC_LIMIT)
        .map((topic) => ({ id: topic.id, name: topic.name })),
    };
  }

  /**
   * 통계 3영역. **한 덩어리로 성공·실패한다** — 화면이 통계를 한 영역으로 실패 처리하므로
   * (`profile.md` 4.8) 요약만 뜨고 그래프만 비는 상태를 만들지 않는다.
   */
  private async buildStats(
    user: User,
    now: Date,
  ): Promise<{
    summary: ProfileStatsSummaryView;
    weekly: WeeklyListeningView;
    distribution: TopicDistributionView;
  }> {
    const [
      completedContentCount,
      totalListenedSec,
      playDates,
      weekly,
      distribution,
    ] = await Promise.all([
      this.libraryService.countCompletedContents(user.id),
      this.playbackService.sumListenedSec(user.id),
      this.playbackService.findPlayDates(user.id),
      this.buildWeeklyListening(user, toCurrentWeekStart(now), now, {
        strict: false,
      }),
      this.buildTopicDistribution(user.id),
    ]);

    return {
      summary: {
        completedContentCount,
        totalListenedSec,
        // 04시 경계 판정이라 서버가 계산한 서비스 날짜를 기준으로 센다(`profile.md` 4.5)
        streakDays: calculateStreakDays(playDates, toServiceDate(now)),
      },
      weekly,
      distribution,
    };
  }

  /**
   * 주간 그래프 한 주.
   *
   * `strict`는 **범위 밖 요청을 거절할지**를 가른다. 4.1의 이번 주는 서버가 고른 값이라
   * 검사할 이유가 없고, 4.2는 클라이언트가 보낸 라벨이라 방어적으로 거절한다.
   *
   * 화살표 활성 여부를 **서버가 정해 내려준다** — `previousWeekStart`가 `null`이면 가입 주라
   * [◀]가 비활성이다. 클라이언트는 `null` 여부만 보고 날짜를 계산하지 않는다.
   */
  private async buildWeeklyListening(
    user: User,
    weekStart: string,
    now: Date,
    options: { strict: boolean },
  ): Promise<WeeklyListeningView> {
    const joinedWeekStart = toCurrentWeekStart(user.createdAt);
    const currentWeekStart = toCurrentWeekStart(now);

    if (
      options.strict &&
      (weekStart < joinedWeekStart || weekStart > currentWeekStart)
    ) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.STATS_WEEK_OUT_OF_RANGE,
        message: '요청을 처리할 수 없어요',
        logLevel: 'info',
      });
    }

    const weekDates = toWeekDates(weekStart);
    const listenedSecByDate = await this.playbackService.sumListenedSecByDates(
      user.id,
      weekDates,
    );
    const previousWeekStart = shiftWeekStart(weekStart, -1);
    const nextWeekStart = shiftWeekStart(weekStart, 1);

    return {
      weekStart,
      dailyListenedSec: buildWeeklyBuckets(weekDates, listenedSecByDate),
      // 가입 주보다 앞이면 이전 주가 없다 — 가입 전 주는 조회할 것도 없다
      previousWeekStart:
        previousWeekStart < joinedWeekStart ? null : previousWeekStart,
      // 이번 주를 넘어가는 주는 존재하지 않는다
      nextWeekStart: nextWeekStart > currentWeekStart ? null : nextWeekStart,
    };
  }

  /**
   * 주제 분포 — **집계 기간은 가입 후 전체이고 비율만 내려준다**(합의 2026-08-06).
   *
   * `play_records`(playback 소유)와 `content_topics`(content 소유)를 한 쿼리로 조인하지 않고
   * 두 번에 나눠 받아 합친다. 모듈 경계를 넘는 조인을 Repository에 두면 소유가 흐려지고,
   * 사용자 한 명의 청취 콘텐츠는 조인 없이 합칠 수 있는 규모다(architecture.md 3.4 — 루프
   * 조회가 아니라 두 번의 벌크 조회다).
   */
  private async buildTopicDistribution(
    userId: string,
  ): Promise<TopicDistributionView> {
    const listenedByContent =
      await this.playbackService.sumListenedSecByContent(userId);

    if (listenedByContent.length === 0) {
      return { topics: [], othersRatio: 0 };
    }

    const topicViews = await this.contentService.findTopicViews(
      listenedByContent.map((row) => row.contentId),
    );

    return buildTopicDistribution(listenedByContent, topicViews);
  }

  /**
   * **`cancelled`인데 자동 갱신이 켜져 있는 행은 생기면 안 된다**(domain.md 8.2 —
   * `cancelled`는 해지 예약이므로 정의상 `is_auto_renew = false`다).
   *
   * 생겼다면 S2S 환산이 잘못된 것이다 — 스토어마다 "cancel"이 가리키는 사건이 달라서
   * (Play는 해지 예약, Apple은 환불·철회) 필드명을 그대로 옮기면 이 조합이 만들어진다.
   *
   * 조회를 막지는 않는다. 만료 전이라 혜택이 살아 있는 것은 맞으므로 화면은 그대로 그리고,
   * **데이터가 어긋났다는 사실만 남긴다** — 결제가 붙은 뒤 이 로그가 실제로 찍히는지가
   * 판정을 고칠지 연동을 고칠지 가르는 근거가 된다.
   */
  private warnIfContradictoryCancellation(
    userId: string,
    subscription: Subscription | null,
  ): void {
    if (
      subscription?.status !== SubscriptionStatus.CANCELLED ||
      !subscription.isAutoRenew
    ) {
      return;
    }

    this.logger.warn('cancelled subscription has auto renew on', {
      userId,
      subscriptionId: subscription.id,
      status: subscription.status,
      isAutoRenew: subscription.isAutoRenew,
    });
  }

  private logSectionFailure(
    section: ProfileSection,
    userId: string,
    error: unknown,
  ): void {
    // 부분 실패는 화면이 흡수하는 정상 경로이지만, 반복되면 조치가 필요하므로 warn이다
    this.logger.warn('profile section failed', {
      section,
      userId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}

function toUserView(user: User): ProfileUserView {
  return {
    nickname: user.nickname,
    provider: user.provider,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
  };
}

function toCareerView(user: User): ProfileCareerView {
  return {
    jobCategory: user.jobCategory,
    jobTitle: user.jobTitle,
    // 저장은 int, 계약은 구간 라벨이다(`profile-api.md` 9장 — 저장 표현은 백엔드 소관)
    yearsOfExperience: toYearsOfExperienceRange(user.yearsOfExperience),
  };
}

/**
 * `subscriptions` 행을 화면 4분기로 정규화한다(`profile-api.md` 4.1).
 *
 * **`status`와 `is_auto_renew`의 조합으로 판정하고 `expires_at`을 다시 보지 않는다.**
 * 만료 반영은 스토어 서버 알림(S2S)이 `status`를 바꿔서 하는 일이라(domain.md 8.2),
 * 조회 쪽에서 시각을 비교해 앞질러 판정하면 진실의 원천이 둘이 된다.
 */
function toPlanStatus(subscription: Subscription | null): PlanStatus {
  if (!subscription) {
    return PlanStatus.FREE;
  }

  if (subscription.status === SubscriptionStatus.GRACE) {
    return PlanStatus.GRACE;
  }

  if (
    subscription.status === SubscriptionStatus.EXPIRED ||
    subscription.status === SubscriptionStatus.REFUNDED
  ) {
    return PlanStatus.FREE;
  }

  // active · cancelled — 만료 전이며, 갈리는 것은 자동 갱신 여부뿐이다
  return subscription.isAutoRenew
    ? PlanStatus.SUBSCRIBED
    : PlanStatus.CANCEL_SCHEDULED;
}
