import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import {
  isWeekStartLabel,
  serviceDateStart,
  shiftServiceDate,
  shiftWeekStart,
  toCurrentWeekStart,
  toServiceDate,
  toWeekDates,
} from '@/common/utils/service-date.util';
import { ContentTopicView } from '@/modules/content/content.types';
import { ContentService } from '@/modules/content/services/content.service';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryService } from '@/modules/library/library.service';
import {
  ContentDailyListenedSecView,
  ListenerCohortView,
} from '@/modules/playback/playback.types';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';
import { toYearsOfExperienceRange } from '@/modules/user/user.constant';
import { UserMarket } from '@/modules/user/user.enum';

import {
  PEER_TOP_TOPIC_MIN_LISTENERS,
  TOP_TOPIC_DAY_STREAK_MIN_DAYS,
  TOP_TOPIC_LIMIT,
  TOP_TOPIC_STREAK_LOOKBACK_WEEKS,
  TOP_TOPIC_STREAK_MIN_WEEKS,
  TOPIC_HIGHLIGHT_WINDOW_DAYS,
  WEEKLY_LISTENING_DAY_COUNT,
} from './profile.constant';
import { ProfileSection } from './profile.enum';
import {
  buildTopicDistribution,
  buildWeeklyTopicDistributions,
  buildWeeklyBuckets,
  calculateListeningTopPercent,
  calculateStreakDays,
  countDailyListenedContents,
  countTopTopicDayStreak,
  countTopTopicStreak,
  isTopicConcentrated,
  pickDailyListeningHighlights,
  pickListeningHighlight,
  pickUnexploredTopic,
  rankTopicsByListenedSec,
} from './profile.stats';
import {
  DailyTopicHighlightView,
  ProfileCareerView,
  ProfileStatsSummaryView,
  ProfileSummaryResult,
  ProfileUserView,
  TopicDistributionView,
  TopicHighlightView,
  TopicRefView,
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
    private readonly topicService: TopicService,
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
      this.subscriptionService
        .buildPlanView(userId, {
          trialEndsAt: user.trialEndsAt,
          now,
          market: user.market,
        })
        .catch((error: unknown) => {
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
      this.buildTopicDistribution(user),
    ]);

    return {
      summary: {
        completedContentCount,
        totalListenedSec,
        // 05시 경계 판정이라 서버가 계산한 서비스 날짜를 기준으로 센다(`profile.md` 4.5)
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
    const previousWeekStart = shiftWeekStart(weekStart, -1);
    const nextWeekStart = shiftWeekStart(weekStart, 1);
    const [listenedSecByDate, listenedByContentAndDate] = await Promise.all([
      this.playbackService.sumListenedSecByDates(user.id, weekDates),
      this.playbackService.sumListenedSecByContentAndDates(user.id, weekDates),
    ]);
    const dailyListenedSec = buildWeeklyBuckets(weekDates, listenedSecByDate);
    const [topicDistributions, listeningTopPercent] = await Promise.all([
      this.buildWeeklyTopicDistributions(
        weekDates,
        listenedByContentAndDate,
        user.market,
      ),
      this.buildListeningTopPercent(
        weekDates,
        dailyListenedSec.reduce((sum, sec) => sum + sec, 0),
        serviceDateStart(nextWeekStart),
        user.market,
      ),
    ]);

    const hasPreviousWeek = previousWeekStart >= joinedWeekStart;
    // 직전 주는 요일별로 한 번만 받는다 — 주간 한 줄(같은 요일까지 합)과 요일별 한 줄(같은 요일 값)이 함께 쓴다.
    // 이번 주에 들은 게 없으면 두 한 줄 모두 null 이라 조회할 필요가 없다
    const previousDailyListenedSec =
      hasPreviousWeek && dailyListenedSec.some((sec) => sec > 0)
        ? await this.buildPreviousDailyListenedSec(user.id, previousWeekStart)
        : null;
    const comparableDayCount =
      weekStart === currentWeekStart
        ? weekDates.indexOf(toServiceDate(now)) + 1
        : WEEKLY_LISTENING_DAY_COUNT;
    const listeningHighlight = pickListeningHighlight(
      dailyListenedSec,
      listeningTopPercent,
      previousDailyListenedSec === null
        ? null
        : previousDailyListenedSec
            .slice(0, comparableDayCount)
            .reduce((sum, sec) => sum + sec, 0),
    );
    const dailyListeningHighlight = pickDailyListeningHighlights(
      dailyListenedSec,
      countDailyListenedContents(weekDates, listenedByContentAndDate),
      previousDailyListenedSec,
    );

    // 이번 주에만 — 부가 한 줄이라 실패해도 주간 카드를 막지 않는다(`profile.md` 4.7-1)
    const noTopicHighlights = {
      weekly: null,
      daily: Array<DailyTopicHighlightView | null>(
        WEEKLY_LISTENING_DAY_COUNT,
      ).fill(null),
    };
    const topicHighlights =
      weekStart === currentWeekStart
        ? await this.buildTopicHighlights(
            user,
            now,
            weekStart,
            weekDates,
            listenedByContentAndDate,
            topicDistributions,
          ).catch((error: unknown) => {
            this.logger.warn('profile topic highlight failed', {
              user_id: user.id,
              reason: error instanceof Error ? error.message : 'unknown',
            });
            return noTopicHighlights;
          })
        : noTopicHighlights;

    return {
      weekStart,
      dailyListenedSec,
      listeningTopPercent,
      listeningHighlight,
      dailyListeningHighlight,
      topicHighlight: topicHighlights.weekly,
      dailyTopicHighlight: topicHighlights.daily,
      topicDistribution: topicDistributions.weekly,
      dailyTopicDistribution: topicDistributions.daily,
      // 가입 주보다 앞이면 이전 주가 없다 — 가입 전 주는 조회할 것도 없다
      previousWeekStart: hasPreviousWeek ? previousWeekStart : null,
      // 이번 주를 넘어가는 주는 존재하지 않는다
      nextWeekStart: nextWeekStart > currentWeekStart ? null : nextWeekStart,
    };
  }

  /**
   * 주간 한 줄과 요일별 한 줄을 함께 만든다. 안 들어본 주제·같은 직군 1위는 **한 번만** 조회해 주간·요일이 나눠 쓴다
   * (필요해질 때 처음 조회한다 — 앞 순위에서 정해지면 조회하지 않는다).
   */
  private async buildTopicHighlights(
    user: User,
    now: Date,
    weekStart: string,
    weekDates: string[],
    listenedByContentAndDate: ContentDailyListenedSecView[],
    distributions: {
      weekly: TopicDistributionView;
      daily: TopicDistributionView[];
      topicViews: ContentTopicView[];
    },
  ): Promise<{
    weekly: TopicHighlightView | null;
    daily: (DailyTopicHighlightView | null)[];
  }> {
    const today = toServiceDate(now);
    const windowDates = Array.from(
      { length: TOPIC_HIGHLIGHT_WINDOW_DAYS },
      (_, index) =>
        shiftServiceDate(today, index - (TOPIC_HIGHLIGHT_WINDOW_DAYS - 1)),
    );
    const lookups: TopicHighlightLookups = {
      unexplored: once(() => this.findUnexploredTopic(user, windowDates)),
      peerTop: once(() => this.findPeerTopTopic(user, windowDates)),
    };

    const weekly = await this.buildTopicHighlight(
      user,
      weekStart,
      listenedByContentAndDate,
      distributions.topicViews,
      distributions.weekly,
      lookups,
    );
    const daily = await this.buildDailyTopicHighlights(
      weekDates,
      listenedByContentAndDate,
      distributions.topicViews,
      distributions.daily,
      lookups,
    );

    return { weekly, daily };
  }

  /**
   * 요일별 주제 한 줄 — 그날 분포로 주간과 같은 순서를 밟는다. 연속은 "N일 연속 1위"(그 주 안), 주제 수는 그날 것이다.
   *
   * 1. 그날 쏠렸으면 → 안 들어본 주제(주간과 같은 값)
   * 2. 같은 직군 1위가 그날 1위와 다르면 → 같은 직군 1위(주간과 같은 값)
   * 3. 그날 1위가 2일 이상 연속 1위면 → N일 연속 1위
   * 4. 그날 들은 주제가 2개 이상이면 → 그날 N개 주제
   * 5. 그래도 없으면(1에서 안 봤을 때만) → 안 들어본 주제, 없으면 `null`
   */
  private async buildDailyTopicHighlights(
    weekDates: string[],
    listenedByContentAndDate: ContentDailyListenedSecView[],
    weekTopicViews: ContentTopicView[],
    dailyDistributions: TopicDistributionView[],
    lookups: TopicHighlightLookups,
  ): Promise<(DailyTopicHighlightView | null)[]> {
    const dailyTopTopicIds = dailyDistributions.map(
      (distribution) => distribution.topics[0]?.topicId ?? null,
    );
    const result: (DailyTopicHighlightView | null)[] = [];

    for (const [dayIndex, date] of weekDates.entries()) {
      const dayTop = dailyDistributions[dayIndex]?.topics[0];
      if (dayTop === undefined) {
        result.push(null);
        continue;
      }
      const topicCount = rankTopicsByListenedSec(
        listenedByContentAndDate.filter((row) => row.playDate === date),
        weekTopicViews,
      ).length;
      const concentrated = isTopicConcentrated(
        dailyDistributions[dayIndex],
        topicCount,
      );

      result.push(
        await pickHighlightInOrder<DailyTopicHighlightView>([
          async () => {
            if (!concentrated) return null;
            const unexplored = await lookups.unexplored();
            return unexplored && { kind: 'unexplored_topic', ...unexplored };
          },
          async () => {
            const peerTop = await lookups.peerTop();
            return peerTop && peerTop.topicId !== dayTop.topicId
              ? { kind: 'peer_top_topic', ...peerTop }
              : null;
          },
          () => {
            const days = countTopTopicDayStreak(dailyTopTopicIds, dayIndex);
            return Promise.resolve(
              days >= TOP_TOPIC_DAY_STREAK_MIN_DAYS
                ? { kind: 'top_topic_day_streak', days }
                : null,
            );
          },
          () =>
            Promise.resolve(
              topicCount >= 2
                ? { kind: 'topic_count', count: topicCount }
                : null,
            ),
          async () => {
            if (concentrated) return null;
            const unexplored = await lookups.unexplored();
            return unexplored && { kind: 'unexplored_topic', ...unexplored };
          },
        ]),
      );
    }

    return result;
  }

  /**
   * "가장 많이 들은 주제" 옆 한 줄(`profile.md` 4.7-1) — **첫 번째로 해당하는 하나**만 고르고, 앞에서 정해지면 뒤의
   * 조회는 하지 않는다.
   *
   * 1. 한 주제에 쏠렸으면(`isTopicConcentrated`) → 안 들어본 주제
   * 2. 커리어 직군이 있고 같은 직군 집계 인원이 충분하며 그 1위가 내 1위와 다르면 → 같은 직군 1위
   * 3. 이번 주 1위가 2주 이상 연속 1위면 → N주 연속 1위
   * 4. 들은 주제가 2개 이상이면 → 이번 주 N개 주제
   * 5. 그래도 없으면(1에서 안 봤을 때만) → 안 들어본 주제, 없으면 `null`
   *
   * 그 주 주제 기록이 없으면 `null` — 옆에 붙을 헤드라인이 없다.
   */
  private async buildTopicHighlight(
    user: User,
    weekStart: string,
    listenedByContentAndDate: ContentDailyListenedSecView[],
    weekTopicViews: ContentTopicView[],
    weekly: TopicDistributionView,
    lookups: TopicHighlightLookups,
  ): Promise<TopicHighlightView | null> {
    const myTop = weekly.topics[0];
    if (myTop === undefined) {
      return null;
    }

    const topicCount = rankTopicsByListenedSec(
      listenedByContentAndDate,
      weekTopicViews,
    ).length;
    const concentrated = isTopicConcentrated(weekly, topicCount);

    if (concentrated) {
      const unexplored = await lookups.unexplored();
      if (unexplored !== null) {
        return { kind: 'unexplored_topic', ...unexplored };
      }
    }

    const peerTop = await lookups.peerTop();
    if (peerTop !== null && peerTop.topicId !== myTop.topicId) {
      return { kind: 'peer_top_topic', ...peerTop };
    }

    const streakWeeks = await this.countTopTopicStreakWeeks(
      user,
      weekStart,
      myTop.topicId,
    );
    if (streakWeeks >= TOP_TOPIC_STREAK_MIN_WEEKS) {
      return { kind: 'top_topic_streak', weeks: streakWeeks };
    }

    if (topicCount >= 2) {
      return { kind: 'topic_count', count: topicCount };
    }

    if (!concentrated) {
      const unexplored = await lookups.unexplored();
      if (unexplored !== null) {
        return { kind: 'unexplored_topic', ...unexplored };
      }
    }

    return null;
  }

  /**
   * 안 들어본 주제 — 그 시장 노출 주제 중 **한 번도 안 들었고 직접 해제하지도 않은** 주제에서, 최근 그 시장에서
   * 가장 많이 들린 것. 탭하면 탐색의 그 주제 목록으로 가므로 노출 주제만 고른다.
   */
  private async findUnexploredTopic(
    user: User,
    windowDates: string[],
  ): Promise<TopicRefView | null> {
    const [visibleTopics, removedTopicIds, listenedByContent] =
      await Promise.all([
        this.topicService.findAllVisible(user.market),
        this.userInterestService.findUserRemovedTopicIds(user.id),
        this.playbackService.sumListenedSecByContent(user.id),
      ]);
    const listenedTopicViews =
      listenedByContent.length === 0
        ? []
        : await this.contentService.findTopicViews(
            listenedByContent.map((row) => row.contentId),
            undefined,
            user.market,
          );
    const excluded = new Set([
      ...removedTopicIds,
      ...rankTopicsByListenedSec(listenedByContent, listenedTopicViews).map(
        (topic) => topic.topicId,
      ),
    ]);
    const candidates = visibleTopics
      .filter((topic) => !excluded.has(topic.id))
      .map((topic) => ({ topicId: topic.id, name: topic.name }));

    if (candidates.length === 0) {
      return null;
    }

    const marketRanking = await this.rankCohortTopics(windowDates, {
      market: user.market,
    });

    return pickUnexploredTopic(candidates, marketRanking);
  }

  /**
   * 같은 직군(나 제외) 사용자들이 최근 가장 많이 들은 노출 주제. 직군이 없거나 그 기간에 들은 같은 직군 인원이
   * `PEER_TOP_TOPIC_MIN_LISTENERS`보다 적으면 `null` — 몇 사람의 취향을 그대로 드러내지 않는다.
   */
  private async findPeerTopTopic(
    user: User,
    windowDates: string[],
  ): Promise<TopicRefView | null> {
    if (!user.jobCategory) {
      return null;
    }

    const cohort: ListenerCohortView = {
      market: user.market,
      jobCategory: user.jobCategory,
      excludeUserId: user.id,
    };
    const listeners = await this.playbackService.countListenersForCohort(
      windowDates,
      cohort,
    );
    if (listeners < PEER_TOP_TOPIC_MIN_LISTENERS) {
      return null;
    }

    const [ranking, visibleTopics] = await Promise.all([
      this.rankCohortTopics(windowDates, cohort),
      this.topicService.findAllVisible(user.market),
    ]);
    const visibleIds = new Set(visibleTopics.map((topic) => topic.id));
    const top = ranking.find((topic) => visibleIds.has(topic.topicId));

    return top === undefined ? null : { topicId: top.topicId, name: top.name };
  }

  /** 한 범위의 주제별 청취 합(내림차순) — 콘텐츠 축 집계 + 주제 매핑, 두 번의 조회 */
  private async rankCohortTopics(
    windowDates: string[],
    cohort: ListenerCohortView,
  ): Promise<(TopicRefView & { listenedSec: number })[]> {
    const listenedByContent =
      await this.playbackService.sumListenedSecByContentForCohort(
        windowDates,
        cohort,
      );
    if (listenedByContent.length === 0) {
      return [];
    }
    const topicViews = await this.contentService.findTopicViews(
      listenedByContent.map((row) => row.contentId),
      undefined,
      cohort.market,
    );
    return rankTopicsByListenedSec(listenedByContent, topicViews);
  }

  /**
   * 이번 주 1위가 몇 주 연속 1위인지 — 이번 주 포함 `TOP_TOPIC_STREAK_LOOKBACK_WEEKS`주까지만 본다. 지난 주들의 청취는
   * 한 번에 받는다. 가입 주보다 앞은 보지 않는다.
   */
  private async countTopTopicStreakWeeks(
    user: User,
    weekStart: string,
    currentTopTopicId: string,
  ): Promise<number> {
    const joinedWeekStart = toCurrentWeekStart(user.createdAt);
    const previousWeekStarts = Array.from(
      { length: TOP_TOPIC_STREAK_LOOKBACK_WEEKS - 1 },
      (_, index) => shiftWeekStart(weekStart, -(index + 1)),
    ).filter((start) => start >= joinedWeekStart);

    if (previousWeekStarts.length === 0) {
      return 1;
    }

    const datesByWeek = previousWeekStarts.map((start) => toWeekDates(start));
    const rows = await this.playbackService.sumListenedSecByContentAndDates(
      user.id,
      datesByWeek.flat(),
    );
    const topicViews =
      rows.length === 0
        ? []
        : await this.contentService.findTopicViews(
            [...new Set(rows.map((row) => row.contentId))],
            undefined,
            user.market,
          );
    const weeklyTops = datesByWeek.map((dates) => {
      const dateSet = new Set(dates);
      const ranked = rankTopicsByListenedSec(
        rows.filter((row) => dateSet.has(row.playDate)),
        topicViews,
      );
      return ranked[0]?.topicId ?? null;
    });

    return countTopTopicStreak([currentTopTopicId, ...weeklyTops]);
  }

  /**
   * 직전 주 월~일 청취(KAN-170·171). "전주보다 더"는 이 배열의 **앞 N일 합**과 비교한다 — 진행 중인 이번 주는 오늘 요일까지만
   * 비교한다(주 초반에 지난주 전체와 비교하면 거의 항상 지는 비교가 된다). 끝난 주는 7일 전부다.
   */
  private async buildPreviousDailyListenedSec(
    userId: string,
    previousWeekStart: string,
  ): Promise<number[]> {
    const dates = toWeekDates(previousWeekStart);
    const byDate = await this.playbackService.sumListenedSecByDates(
      userId,
      dates,
    );
    return buildWeeklyBuckets(dates, byDate);
  }

  /**
   * 그 주 청취 시간 전체 상위 %(KAN-168). 모집단은 **그 주가 끝나기 전에 가입한 같은 시장의 전체 계정**이다 —
   * 그 주 0초인 사용자도 들어간다(PM "전체에서"). 내가 0초면 어차피 `null`이라 세지 않는다.
   * 시장을 나누는 이유(2026-10-15): 시장마다 카탈로그·출시 시점이 달라, 섞으면 한쪽의 규모가 다른 쪽의 순위를 정한다.
   */
  private async buildListeningTopPercent(
    weekDates: string[],
    listenedSec: number,
    weekEnd: Date,
    market: UserMarket,
  ): Promise<number | null> {
    if (listenedSec <= 0) {
      return null;
    }

    const [listenedMoreCount, population] = await Promise.all([
      this.playbackService.countUsersListenedMoreByDates(
        weekDates,
        listenedSec,
        market,
      ),
      this.userService.countJoinedBefore(weekEnd, market),
    ]);

    return calculateListeningTopPercent(
      listenedSec,
      listenedMoreCount,
      population,
    );
  }

  /**
   * 주제 분포 — **집계 기간은 가입 후 전체이고 비율만 내려준다**(합의 2026-08-06).
   *
   * `play_records`(playback 소유)와 `content_topics`(content 소유)를 한 쿼리로 조인하지 않고
   * 두 번에 나눠 받아 합친다. 모듈 경계를 넘는 조인을 Repository에 두면 소유가 흐려지고,
   * 사용자 한 명의 청취 콘텐츠는 조인 없이 합칠 수 있는 규모다(architecture.md 3.4 — 루프
   * 조회가 아니라 두 번의 벌크 조회다).
   */
  /**
   * 주간 카드의 그 주·요일별 주제 분포(KAN-113). 전체 기간 분포와 같은 두 번 조회 구조다 —
   * 콘텐츠 × 날짜 합은 한 쿼리(사용자·날짜 인덱스), 주제 매핑은 등장한 콘텐츠만 한 번.
   */
  private async buildWeeklyTopicDistributions(
    weekDates: string[],
    listenedByContentAndDate: ContentDailyListenedSecView[],
    market: UserMarket,
  ): Promise<{
    weekly: TopicDistributionView;
    daily: TopicDistributionView[];
    topicViews: ContentTopicView[];
  }> {
    if (listenedByContentAndDate.length === 0) {
      return {
        ...buildWeeklyTopicDistributions(weekDates, [], []),
        topicViews: [],
      };
    }

    const contentIds = [
      ...new Set(listenedByContentAndDate.map((row) => row.contentId)),
    ];
    const topicViews = await this.contentService.findTopicViews(
      contentIds,
      undefined,
      market,
    );

    return {
      ...buildWeeklyTopicDistributions(
        weekDates,
        listenedByContentAndDate,
        topicViews,
      ),
      topicViews,
    };
  }

  /** 주제는 현재 시장의 것만 — 시장을 바꾼 사용자에게 이전 시장 주제 이름이 섞이지 않게(`global-api.md` 4.11) */
  private async buildTopicDistribution(
    user: User,
  ): Promise<TopicDistributionView> {
    const listenedByContent =
      await this.playbackService.sumListenedSecByContent(user.id);

    if (listenedByContent.length === 0) {
      return { topics: [], othersRatio: 0 };
    }

    const topicViews = await this.contentService.findTopicViews(
      listenedByContent.map((row) => row.contentId),
      undefined,
      user.market,
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
      // convention.md 8.1 — 로그 공통 필드는 snake_case `user_id`다
      user_id: userId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/** 주간·요일 한 줄이 나눠 쓰는 조회 — 처음 부를 때 한 번만 조회한다 */
interface TopicHighlightLookups {
  unexplored: () => Promise<TopicRefView | null>;
  peerTop: () => Promise<TopicRefView | null>;
}

/** 처음 부를 때 한 번만 돌리고 이후엔 같은 결과를 돌려준다 */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= load();
    return pending;
  };
}

/** 순서대로 시도해 처음으로 값이 나온 것 — 뒤 단계는 부르지 않는다 */
async function pickHighlightInOrder<T>(
  steps: (() => Promise<T | null>)[],
): Promise<T | null> {
  for (const step of steps) {
    const value = await step();
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function toUserView(user: User): ProfileUserView {
  return {
    nickname: user.nickname,
    profileImageUrl: user.profileImageUrl,
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
