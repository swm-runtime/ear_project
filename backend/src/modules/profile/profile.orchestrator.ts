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
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';
import { toYearsOfExperienceRange } from '@/modules/user/user.constant';

import { TOP_TOPIC_LIMIT } from './profile.constant';
import { ProfileSection } from './profile.enum';
import {
  buildTopicDistribution,
  buildWeeklyBuckets,
  calculateStreakDays,
} from './profile.stats';
import {
  ProfileCareerView,
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
    private readonly userInterestService: UserInterestService,
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
      this.subscriptionService.buildPlanView(userId).catch((error: unknown) => {
        this.logSectionFailure(ProfileSection.PLAN, userId, error);
        failedSections.push(ProfileSection.PLAN);
        return null;
      }),
      this.userInterestService
        .buildSummary(userId, TOP_TOPIC_LIMIT)
        .catch((error: unknown) => {
          this.logSectionFailure(
            ProfileSection.INTEREST_SUMMARY,
            userId,
            error,
          );
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
