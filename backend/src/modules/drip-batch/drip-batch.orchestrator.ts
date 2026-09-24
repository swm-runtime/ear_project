import { Injectable, Logger } from '@nestjs/common';

import { toServiceDate } from '@/common/utils/service-date.util';
import { ContentService } from '@/modules/content/services/content.service';
import { ContentStatService } from '@/modules/content/services/content-stat.service';
import { Content } from '@/modules/content/entities/content.entity';
import {
  COLD_START_COMPLETE_THRESHOLD,
  DRIP_BATCH_USER_PAGE_SIZE,
  DRIP_IGNORE_AFTER_DAYS,
  EXPOSURE_FATIGUE_LOOKBACK_DAYS,
  SCORING_POOL_LIMIT,
  SIGNAL_LOOKBACK_DAYS,
  SIGNAL_LOOKBACK_LIMIT,
  UNFINISHED_INVENTORY_LIMIT,
} from '@/modules/drip/drip.constant';
import { PreferenceSignalAction } from '@/modules/drip/drip.enum';
import {
  PreferenceSignalInput,
  ScoredCandidate,
  ScoringCandidate,
  UserCareer,
  UserPreferenceWeights,
} from '@/modules/drip/drip.types';
import { DripBatchRunService } from '@/modules/drip/services/drip-batch-run.service';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { DripPlacementService } from '@/modules/drip/services/drip-placement.service';
import { DripScoringService } from '@/modules/drip/services/drip-scoring.service';
import { PreferenceVectorService } from '@/modules/drip/services/preference-vector.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import {
  ArrivedContent,
  DripArrival,
} from '@/modules/notification/notification.types';
import { DripArrivalNotificationService } from '@/modules/notification/services/drip-arrival-notification.service';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

import {
  DiscoveryPlan,
  PlanOptions,
  RegularPlan,
  UserDripPlan,
} from './drip-batch.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 사용자 단위 처리 결과 — `drip_batch_runs`의 카운트로 접힌다(domain.md 7.3) */
/**
 * 사용자 한 명의 편성 결과.
 *
 * **`exhausted`를 `scheduled`와 합치지 않는다** — `drip-scheduling.md` 5장의 사용자 상태에
 * `no_candidates(고갈)`가 있고, 운영 콘솔이 **고갈 사용자 수**를 본다. 합쳐 두면 "2편 적립"과
 * "0편 고갈"이 같은 숫자에 들어가, 후보가 말라 가는 것을 지표로 알 수 없다.
 */
type UserOutcome = 'scheduled' | 'skipped' | 'exhausted';

/** 편성 결과 + 알림에 넘길 그날 적립분(정규·탐험). 적립이 없으면 `arrival`은 null */
interface UserScheduleResult {
  outcome: UserOutcome;
  arrival: DripArrival | null;
}

/** 티어별 편성 편수 — 실행 1회 안에서 한 번만 읽는다(아래 `PlanCountCache`) */
interface PlanCounts {
  dripCount: number;
  discoveryCount: number;
}

/**
 * 실행 단위 캐시. `plans`는 운영이 배포 없이 바꾸는 정책값이지만 **배치가 도는 몇 분 사이에
 * 바뀔 값은 아니고**, 바뀌더라도 한 실행 안에서는 전 사용자에게 같은 값이 적용되는 편이
 * 맞다. 없으면 사용자마다 2~4번(폴백 포함) `plans`를 다시 읽어, 5천 명이면 만 번 넘는
 * 왕복이 편성 자체와 무관한 데서 나간다(2026-09-09 감사 — 사용자당 20~24쿼리 중 일부).
 */
export type PlanCountCache = Map<UserTier, PlanCounts>;

/**
 * 일일 편성 배치 — `drip-scheduling.md` 2(트리거)·4(처리 로직)의 실행부다.
 *
 * **Orchestrator인 이유**(architecture.md 3.3의 명시 대상): 스코어링 입력인 소비 신호의
 * 소유자가 `playback`인데 `playback → drip` 의존이 이미 있어(재생 시 영구 제외 적재)
 * `drip`이 신호를 직접 읽으면 순환이 된다. 그래서 두 모듈 **위에서** 소유 모듈들의
 * Service만 조합한다 — 도메인 판정(스코어링·집계·적립 원자성)은 전부 `drip` 모듈에 있고,
 * 여기는 순서·조합·사용자 단위 실패 격리만 담당한다.
 *
 * **전체를 한 트랜잭션으로 묶지 않는다**(architecture.md 8.1) — 사용자 단위로 처리해
 * 실패한 사용자만 남기고 계속 간다(`drip-scheduling.md` 7 — 전체 롤백하지 않는다).
 *
 * **계산(`planForUser`)과 쓰기(`scheduleForUser`의 적립·알림)를 갈라 둔다**(2026-09-18) — 편성
 * 미리보기(`DripPreviewService`)가 같은 계산을 저장 없이 돌려 "이대로라면 무엇이 가는가"를 보이기
 * 위해서다. 계산기가 하나여야 미리보기와 실제 배치가 어긋나지 않는다.
 */
@Injectable()
export class DripBatchOrchestrator {
  private readonly logger = new Logger(DripBatchOrchestrator.name);

  constructor(
    private readonly userService: UserService,
    private readonly userInterestService: UserInterestService,
    private readonly planService: PlanService,
    private readonly contentService: ContentService,
    private readonly contentStatService: ContentStatService,
    private readonly libraryService: LibraryService,
    private readonly playbackService: PlaybackService,
    private readonly preferenceVectorService: PreferenceVectorService,
    private readonly dripScoringService: DripScoringService,
    private readonly dripPlacementService: DripPlacementService,
    private readonly dripExclusionService: DripExclusionService,
    private readonly dripBatchRunService: DripBatchRunService,
    private readonly dripArrivalNotificationService: DripArrivalNotificationService,
  ) {}

  /**
   * 배치 1회 실행. **같은 서비스 날짜에 두 번 실행되지 않는다** —
   * `drip_batch_runs.run_date` 유니크 선점이 배치 단위를, `library_items` 유니크가
   * 사용자 단위를 막는다(`drip-scheduling.md` 4.6-5).
   */
  async run(now: Date): Promise<void> {
    const runDate = toServiceDate(now);
    const run = await this.dripBatchRunService.claim(runDate, now);

    if (!run) {
      this.logger.log('drip batch already claimed for the date', {
        run_date: runDate,
      });
      return;
    }

    const counts = {
      targetCount: 0,
      successCount: 0,
      skippedCount: 0,
      exhaustedCount: 0,
      failedCount: 0,
    };

    let afterId: string | null = null;
    const planCounts: PlanCountCache = new Map();

    /**
     * **어떻게 끝나든 실행 기록을 닫는다.** 사용자 단위 실패는 아래에서 흡수되지만,
     * 페이지 조회처럼 루프 자체가 던지는 경로가 남아 있다. 그때 `finish`를 건너뛰면
     * `finished_at`이 NULL로 남아 **그날 재실행이 막힌다** — 이제는 오래된 행을 다시
     * 집을 수 있지만(`DRIP_BATCH_STALE_MS`), 그건 마지막 방어선이지 정상 경로가 아니다.
     */
    try {
      for (;;) {
        const users: User[] = await this.userService.findDripTargetsPage(
          afterId,
          DRIP_BATCH_USER_PAGE_SIZE,
        );

        if (users.length === 0) {
          break;
        }

        const arrivals: DripArrival[] = [];

        for (const user of users) {
          counts.targetCount += 1;

          try {
            const { outcome, arrival } = await this.scheduleForUser(
              user,
              now,
              planCounts,
            );

            if (arrival) {
              arrivals.push(arrival);
            }

            if (outcome === 'scheduled') {
              counts.successCount += 1;
            } else if (outcome === 'exhausted') {
              counts.exhaustedCount += 1;
            } else {
              counts.skippedCount += 1;
            }
          } catch (error) {
            counts.failedCount += 1;
            this.logger.warn('drip scheduling failed for user', {
              user_id: user.id,
              error: toErrorMessage(error),
            });
          }
        }

        await this.notifyArrivals(arrivals, now);
        afterId = users[users.length - 1].id;
      }
    } finally {
      // 네 카운트 합 = targetCount (domain.md 7.3). exhausted는 2026-09-11부터 컬럼에 남는다 —
      // 그전엔 로그에만 있어 "대상 13 · 성공 3"의 나머지 10명이 표에서 사라졌다
      await this.dripBatchRunService.finish(run, counts, new Date());
    }

    // 건당 로그를 남기지 않고 실행 결과를 집계해 한 번 남긴다 (convention.md 8.3 — 드립 편성)
    this.logger.log('drip batch finished', {
      run_date: runDate,
      target_count: counts.targetCount,
      success_count: counts.successCount,
      skipped_count: counts.skippedCount,
      exhausted_count: counts.exhaustedCount,
      failed_count: counts.failedCount,
    });
  }

  /**
   * 드립 도착 알림(`notification.md` 4.3). **페이지 단위로 모아 보낸다** — 사용자마다 부르면 발송 요청이
   * 사용자 수만큼 나가고, 전체가 끝난 뒤에 몰아 보내면 앞 사용자의 알림이 배치 시간만큼 늦는다.
   * 페이지 안의 사용자는 **탐험 편성까지 끝난 뒤**라 정규 + 탐험을 합친 1건이 된다.
   *
   * 알림 실패는 편성을 되돌리지 않고 배치도 멈추지 않는다 — 적립은 이미 커밋됐다.
   */
  private async notifyArrivals(
    arrivals: DripArrival[],
    now: Date,
  ): Promise<void> {
    if (arrivals.length === 0) {
      return;
    }

    try {
      await this.dripArrivalNotificationService.notify(arrivals, now);
    } catch (error) {
      this.logger.warn('drip arrival notification failed', {
        user_count: arrivals.length,
        error: toErrorMessage(error),
      });
    }
  }

  private async scheduleForUser(
    user: User,
    now: Date,
    planCounts: PlanCountCache,
  ): Promise<UserScheduleResult> {
    const plan = await this.planForUser(user, now, planCounts, {
      persistPreference: true,
      stopAtSkip: true,
    });

    if (plan.skipReason !== null) {
      return { outcome: 'skipped', arrival: null };
    }

    const regularPicks = plan.regular?.picks ?? [];

    if (regularPicks.length > 0) {
      this.logPicks(
        'regular',
        user.id,
        regularPicks,
        plan.isColdStart === true,
      );
      await this.dripPlacementService.placeItems(
        user.id,
        regularPicks.map((pick) => pick.content.id),
        LibraryItemSource.DRIP,
        now,
      );
    }

    // 탐험 실패는 정규 편성을 되돌리지 않는다(4.8 — 부가 슬롯이 본편을 막으면 안 된다)
    let discoveryPicks: ScoredCandidate[] = [];

    if (plan.discoveryError !== null) {
      this.logger.warn('discovery scheduling failed', {
        user_id: user.id,
        error: plan.discoveryError,
      });
    } else if (plan.discovery !== null && plan.discovery.picks.length > 0) {
      try {
        this.logPicks('discovery', user.id, plan.discovery.picks, false);
        await this.dripPlacementService.placeItems(
          user.id,
          plan.discovery.picks.map((pick) => pick.content.id),
          LibraryItemSource.DISCOVERY,
          now,
        );
        discoveryPicks = plan.discovery.picks;
      } catch (error) {
        this.logger.warn('discovery scheduling failed', {
          user_id: user.id,
          error: toErrorMessage(error),
        });
      }
    }

    // 정규 편성이 0편이면 후보가 마른 것이다(4.1의 스킵 조건은 위에서 이미 걸렀다).
    // 탐험 슬롯만 채워졌더라도 본편이 없으면 그날의 편성은 성공이 아니다
    const arrival: DripArrival | null =
      regularPicks.length + discoveryPicks.length > 0
        ? {
            userId: user.id,
            regular: regularPicks.map(toArrivedContent),
            discovery: discoveryPicks.map(toArrivedContent),
          }
        : null;

    return {
      outcome: regularPicks.length > 0 ? 'scheduled' : 'exhausted',
      arrival,
    };
  }

  /**
   * 사용자 한 명의 편성을 **계산만** 한다(`drip-scheduling.md` 4.1~4.8). 적립·알림·배치 기록은 하지
   * 않는다 — 유일한 쓰기는 `persistPreference`가 켜졌을 때의 취향 캐시 저장이다(4.3).
   *
   * 배치(`scheduleForUser`)와 편성 미리보기(`DripPreviewService`)가 **같은 함수**를 부른다. 미리보기가
   * "이대로라면 어떤 2편·어떤 1편이 가는가"에 실제 배치와 같은 답을 내려면 계산기가 하나여야 한다.
   */
  async planForUser(
    user: User,
    now: Date,
    planCounts: PlanCountCache,
    options: PlanOptions,
  ): Promise<UserDripPlan> {
    const plan: UserDripPlan = {
      userId: user.id,
      activeTopicIds: [],
      skipReason: null,
      unfinishedCount: null,
      dripCount: null,
      discoveryCount: null,
      signals: [],
      signalContentsById: new Map(),
      completeSignalCount: null,
      isColdStart: null,
      preference: null,
      difficultyAffinity: null,
      completedEpisodesBySeries: new Map(),
      regular: null,
      discovery: null,
      discoveryError: null,
    };

    // 관심사 0은 방어적 처리 — 정상 경로에서는 도달 불가(`drip-scheduling.md` 4.1)
    plan.activeTopicIds = await this.userInterestService.findActiveTopicIds(
      user.id,
    );

    if (plan.activeTopicIds.length === 0) {
      plan.skipReason = 'no_interests';
      return plan;
    }

    /**
     * 취향 캐시는 **적립 여부와 무관하게** 배치 시점에 재계산한다(`drip-scheduling.md` 4.3 —
     * "편성 배치 시점에 최신 신호를 읽어 계산한다"). 아래 재고·플랜 스킵은 **적립 규칙**(4.1)이라
     * 여기 뒤에 둔다 — 스킵 뒤에 두면 재고가 늘 5편 이상인 사용자(담기를 많이 하는 사용자가 바로
     * 그 대상)는 캐시가 영영 만들어지지 않아 탐색 피드(같은 캐시를 읽는다)가 무기한 콜드스타트·
     * 묵은 순서로 남는다(결정 2026-09-15). 스킵 사용자당 6쿼리가 늘지만 편성 결과는 변하지 않는다.
     */
    const preferenceResult = await this.rebuildPreference(
      user.id,
      now,
      options.persistPreference,
    );
    plan.signals = preferenceResult.signals;
    plan.signalContentsById = preferenceResult.contentsById;
    plan.completeSignalCount = preferenceResult.completeSignalCount;
    plan.preference = preferenceResult.preference;
    plan.difficultyAffinity = preferenceResult.difficultyAffinity;
    plan.isColdStart = preferenceResult.isColdStart;

    // 미청취 재고 스킵(4.1) — 탐험 편성도 함께 건너뛴다(4.8)
    plan.unfinishedCount = await this.libraryService.countUnfinished(user.id);

    if (plan.unfinishedCount >= UNFINISHED_INVENTORY_LIMIT) {
      plan.skipReason = 'unfinished_inventory';

      if (options.stopAtSkip) {
        return plan;
      }
    }

    const { dripCount, discoveryCount } = await this.resolvePlanCounts(
      user.tier,
      planCounts,
    );
    plan.dripCount = dripCount;
    plan.discoveryCount = discoveryCount;

    if (dripCount <= 0 && discoveryCount <= 0) {
      // 재고 스킵이 먼저 났으면 그 사유를 유지한다(배치가 보는 순서와 같다)
      plan.skipReason ??= 'plan_disabled';

      if (options.stopAtSkip) {
        return plan;
      }
    }

    plan.completedEpisodesBySeries =
      await this.libraryService.findCompletedSeriesMaxEpisodes(user.id);

    if (dripCount > 0) {
      plan.regular = await this.planRegular(user.id, {
        activeTopicIds: plan.activeTopicIds,
        completedEpisodesBySeries: plan.completedEpisodesBySeries,
        preference: plan.preference,
        difficultyAffinity: plan.difficultyAffinity,
        isColdStart: plan.isColdStart,
        // 커리어 적합도(4.2 ③) — 프로필이라 신호가 없어도 쓴다
        career: {
          jobCategory: user.jobCategory,
          yearsOfExperience: user.yearsOfExperience,
        },
        dripCount,
        now,
      });
    }

    // 탐험 계산 실패는 정규 편성을 되돌리지 않는다(4.8) — 사유만 남긴다
    try {
      if (discoveryCount > 0) {
        const regularPicks = plan.regular?.picks ?? [];

        plan.discovery = await this.planDiscovery(user.id, {
          activeTopicIds: plan.activeTopicIds,
          // 방금 뽑은 정규 편성분만 넘긴다 — 누적 이력은 SQL의 NOT EXISTS가 본다
          alreadyPickedIds: regularPicks.map((pick) => pick.content.id),
          pickedTopicIds: [
            ...new Set(regularPicks.flatMap((pick) => pick.topicIds)),
          ],
          // 탐험 편의 MMR 비교 대상(4.2-3) — 정규 편과 내용이 겹치는 탐험 편을 막는다
          pickedEmbeddings: regularPicks.flatMap((pick) =>
            pick.embedding === null ? [] : [pick.embedding],
          ),
          discoveryCount,
          now,
        });
      }
    } catch (error) {
      plan.discoveryError = toErrorMessage(error);
    }

    return plan;
  }

  private async resolvePlanCounts(
    tier: UserTier,
    cache: PlanCountCache,
  ): Promise<PlanCounts> {
    const cached = cache.get(tier);

    if (cached) {
      return cached;
    }

    const counts: PlanCounts = {
      dripCount: await this.planService.getDailyDripCount(tier),
      discoveryCount: await this.planService.getDailyDiscoveryCount(tier),
    };
    cache.set(tier, counts);

    return counts;
  }

  /**
   * 4.3 — 배치 시점에 최신 신호를 읽어 취향 캐시를 재계산한다.
   * `persist`가 꺼져 있으면 같은 계산을 저장 없이 한다(편성 미리보기).
   */
  private async rebuildPreference(userId: string, now: Date, persist: boolean) {
    const since = new Date(now.getTime() - SIGNAL_LOOKBACK_DAYS * MS_PER_DAY);
    const signals = await this.playbackService.findRecentSignals(
      userId,
      since,
      SIGNAL_LOOKBACK_LIMIT,
    );
    const completeSignalCount = await this.playbackService.countSignals(
      userId,
      UserSignalAction.COMPLETE,
    );

    /**
     * "무시" 신호(`drip-scheduling.md` 4.3, 2026-09-24) — `user_signals`에 없고 라이브러리 상태에서 파생한다.
     * 드립·탐험으로 받아 `DRIP_IGNORE_AFTER_DAYS` 동안 열지도 지우지도 않은 항목을 약한 부정으로 본다.
     * 신호 시각은 **판정 시각(적립 + N일)** 이라 그날부터 다른 신호와 같은 반감기로 흐려지고, 나중에
     * 재생하면 `unplayed`가 아니어서 자동으로 빠진다. 삭제분은 `delete` 신호가 이미 잡으므로 여기서 제외된다.
     * 저장하지 않고 배치마다 다시 계산한다 — 스키마 변경 없음.
     */
    const ignoredAddedBefore = new Date(
      now.getTime() - DRIP_IGNORE_AFTER_DAYS * MS_PER_DAY,
    );
    const ignoredItems = await this.libraryService.findIgnoredDripItems(
      userId,
      since,
      ignoredAddedBefore,
    );
    const ignoreSignals: PreferenceSignalInput[] = ignoredItems.map((item) => ({
      contentId: item.contentId,
      action: PreferenceSignalAction.IGNORE,
      createdAt: new Date(
        item.addedAt.getTime() + DRIP_IGNORE_AFTER_DAYS * MS_PER_DAY,
      ),
    }));

    const signalContentIds = [
      ...new Set([
        ...signals.map((signal) => signal.contentId),
        ...ignoreSignals.map((signal) => signal.contentId),
      ]),
    ];
    const signalContents =
      await this.contentService.findAllByIds(signalContentIds);
    const contentsById = new Map(
      signalContents.map((content) => [content.id, content]),
    );
    const [topicIdsByContentId, embeddingsByContentId] = await Promise.all([
      this.buildTopicIdMap(signalContentIds),
      // 취향 벡터(4.3-1)의 입력 — 현재 모델·현재 버전 행만 온다(모델 혼용 금지, domain.md 5.6)
      this.contentService.findScorableEmbeddings(signalContentIds),
    ]);

    // 값 집합이 같은 두 enum의 매핑은 Orchestrator의 몫이다 (drip.enum.ts 참고)
    const preferenceSignals: PreferenceSignalInput[] = [
      ...signals.map((signal) => ({
        contentId: signal.contentId,
        action: signal.action as string as PreferenceSignalAction,
        createdAt: signal.createdAt,
      })),
      ...ignoreSignals,
    ];

    const preference = persist
      ? await this.preferenceVectorService.rebuild(
          userId,
          preferenceSignals,
          contentsById,
          topicIdsByContentId,
          completeSignalCount,
          now,
          embeddingsByContentId,
        )
      : this.preferenceVectorService.compute(
          preferenceSignals,
          contentsById,
          topicIdsByContentId,
          completeSignalCount,
          now,
          embeddingsByContentId,
        );

    return {
      signals: preferenceSignals,
      contentsById,
      completeSignalCount,
      preference,
      difficultyAffinity: buildDifficultyAffinity(
        preferenceSignals,
        contentsById,
      ),
      isColdStart: completeSignalCount < COLD_START_COMPLETE_THRESHOLD,
    };
  }

  /** 정규 편성 계산(4.2) — 후보 조회 → 시리즈 게이트 → 스코어링 → 다양성 선정. 적립은 하지 않는다 */
  private async planRegular(
    userId: string,
    input: {
      activeTopicIds: string[];
      completedEpisodesBySeries: Map<string, number>;
      preference: UserPreferenceWeights | null;
      difficultyAffinity: Record<string, number> | null;
      isColdStart: boolean;
      career: UserCareer;
      dripCount: number;
      now: Date;
    },
  ): Promise<RegularPlan> {
    const pool = await this.contentService.findCandidates({
      includeTopicIds: input.activeTopicIds,
      excludeSeenByUserId: userId,
      // 시리즈 순서는 아래 filterEpisodeOrder가 판정한다 — 완청한 다음 편은 허용해야 한다
      seriesStartOnly: false,
      limit: SCORING_POOL_LIMIT,
      now: input.now,
    });

    const candidates = await this.buildScoringCandidates(pool);
    const gated = this.dripScoringService.filterEpisodeOrder(
      candidates,
      input.completedEpisodesBySeries,
    );
    const gatedIds = new Set(gated.map((candidate) => candidate.content.id));
    const gatedOut = candidates.filter(
      (candidate) => !gatedIds.has(candidate.content.id),
    );

    if (gated.length === 0) {
      // 고갈 — 대체 없이 그날 적립을 건너뛴다(`drip-scheduling.md` 7, 합의 2026-08-06)
      return {
        poolSize: pool.length,
        gatedOut,
        recentDripTopicIds: [],
        scored: [],
        picks: [],
      };
    }

    // 스코어링에는 쓰지 않는다(노출 피로 폐기 2026-09-25) — 편성 미리보기가 "최근 편성 주제"로 보여 주기만 한다
    const recentDripTopicIds = await this.findRecentDripTopicIds(
      userId,
      input.now,
    );

    const scored = this.dripScoringService.scoreRegularCandidates(gated, {
      activeTopicIds: input.activeTopicIds,
      preference: input.preference,
      difficultyAffinity: input.difficultyAffinity,
      completedEpisodesBySeries: input.completedEpisodesBySeries,
      isColdStart: input.isColdStart,
      career: input.career,
      now: input.now,
    });

    const picks = this.dripScoringService.selectWithDiversity(
      scored,
      input.dripCount,
    );

    return {
      poolSize: pool.length,
      gatedOut,
      recentDripTopicIds,
      scored,
      picks,
    };
  }

  /** 탐험 편성 계산(4.8) — 관심 주제 교집합 필터만 우회하고 나머지 필터는 동일하다. 적립은 하지 않는다 */
  private async planDiscovery(
    userId: string,
    input: {
      activeTopicIds: string[];
      /** 방금 뽑은 정규 편성분. 누적 이력은 `excludeSeenByUserId`가 SQL에서 뺀다 */
      alreadyPickedIds: string[];
      pickedTopicIds: string[];
      pickedEmbeddings: number[][];
      discoveryCount: number;
      now: Date;
    },
  ): Promise<DiscoveryPlan> {
    const pool = await this.contentService.findCandidates({
      excludeSeenByUserId: userId,
      excludeContentIds: input.alreadyPickedIds,
      // 탐험 편은 시리즈 도입부만 — 처음 보는 주제를 3편부터 줄 이유가 없다
      seriesStartOnly: true,
      // 저노출부터 자른다 — 인기순 풀에서 저노출을 고르면 슬롯의 목적이 뒤집힌다(4.8-2)
      lowExposureFirst: true,
      limit: SCORING_POOL_LIMIT,
      now: input.now,
    });

    const candidates = await this.buildScoringCandidates(pool);

    if (candidates.length === 0) {
      return {
        poolSize: 0,
        exposureCounts: new Map(),
        userRemovedTopicIds: [],
        ranking: {
          qualityFloor: 0,
          typicalCompleteRate: 0,
          scored: [],
          excluded: [],
        },
        picks: [],
      };
    }

    const [exposureCounts, userRemovedTopicIds] = await Promise.all([
      this.libraryService.countExposures(
        candidates.map((candidate) => candidate.content.id),
      ),
      this.userInterestService.findUserRemovedTopicIds(userId),
    ]);

    const selectionInput = {
      candidates,
      exposureCounts,
      activeTopicIds: input.activeTopicIds,
      userRemovedTopicIds,
      pickedTopicIds: input.pickedTopicIds,
      pickedEmbeddings: input.pickedEmbeddings,
      count: input.discoveryCount,
      now: input.now,
    };

    return {
      poolSize: pool.length,
      exposureCounts,
      userRemovedTopicIds,
      ranking: this.dripScoringService.rankDiscovery(selectionInput),
      picks: this.dripScoringService.selectDiscovery(selectionInput),
    };
  }

  /** 후보 콘텐츠에 스코어링 입력(전체 구간 집계·주제·임베딩)을 붙인다 */
  private async buildScoringCandidates(
    pool: Content[],
  ): Promise<ScoringCandidate[]> {
    const poolIds = pool.map((content) => content.id);
    const [statsById, topicIdsByContentId, embeddingsByContentId] =
      await Promise.all([
        this.contentStatService.findAllTimeCounts(poolIds),
        this.buildTopicIdMap(poolIds),
        this.contentService.findScorableEmbeddings(poolIds),
      ]);

    return pool.map((content) => ({
      content,
      playCount: statsById.get(content.id)?.playCount ?? 0,
      completeCount: statsById.get(content.id)?.completeCount ?? 0,
      topicIds: topicIdsByContentId.get(content.id) ?? [],
      embedding: embeddingsByContentId.get(content.id) ?? null,
    }));
  }

  private async buildTopicIdMap(
    contentIds: string[],
  ): Promise<Map<string, string[]>> {
    const views = await this.contentService.findTopicViews(contentIds);
    const map = new Map<string, string[]>();

    for (const view of views) {
      const ids = map.get(view.contentId) ?? [];
      ids.push(view.topicId);
      map.set(view.contentId, ids);
    }

    return map;
  }

  /**
   * **왜 이 콘텐츠가 갔는지를 남긴다.**
   *
   * 최종 점수 하나만 남기면 축이 죽어 있어도 겉으로는 정상으로 보인다 — 실제로 인기도
   * 축이 상수 0인 것(`content_stats` 미집계)과 탐험 풀이 뒤집혀 있던 것을, 코드를 읽기
   * 전까지 아무도 알아채지 못했다. **입력이 없어도 점수는 나오기 때문이다.**
   *
   * `null`은 **입력이 없어 축에서 빠졌다**는 뜻이고 0과 다르다(4.2 재정규화).
   * 전 사용자의 특정 항목이 계속 같은 값이면 그 입력이 죽어 있다는 신호다.
   *
   * 사용자당 편성 편수(2~3편)만큼만 남는다 — 후보 300건 전체를 남기지 않는다.
   */
  private logPicks(
    slot: 'regular' | 'discovery',
    userId: string,
    picks: ScoredCandidate[],
    isColdStart: boolean,
  ): void {
    for (const pick of picks) {
      this.logger.log('drip pick scored', {
        user_id: userId,
        content_id: pick.content.id,
        slot,
        cold_start: isColdStart,
        score: round(pick.score),
        axes: {
          embedding: round(pick.breakdown.embedding),
          signal: round(pick.breakdown.signal),
          meta: round(pick.breakdown.meta),
        },
        meta_items: {
          topic_match: round(pick.breakdown.metaItems.topicMatch),
          freshness: round(pick.breakdown.metaItems.freshness),
          popularity: round(pick.breakdown.metaItems.popularity),
          difficulty_fit: round(pick.breakdown.metaItems.difficultyFit),
          career_fit: round(pick.breakdown.metaItems.careerFit),
          series_continuity: round(pick.breakdown.metaItems.seriesContinuity),
          exposure_fatigue: round(pick.breakdown.metaItems.exposureFatigue),
        },
      });
    }
  }

  /** 최근 편성분(드립·탐험)의 주제 — 편성 미리보기 표시용. 스코어링 입력이 아니다(노출 피로 폐기 2026-09-25) */
  private async findRecentDripTopicIds(
    userId: string,
    now: Date,
  ): Promise<string[]> {
    const since = new Date(
      now.getTime() - EXPOSURE_FATIGUE_LOOKBACK_DAYS * MS_PER_DAY,
    );
    const recentContentIds = await this.libraryService.findRecentDripContentIds(
      userId,
      since,
    );
    const topicIdsByContentId = await this.buildTopicIdMap(recentContentIds);

    return [...new Set([...topicIdsByContentId.values()].flat())];
  }
}

/** 완청 이력의 난이도 분포(0~1 비중) — 난이도 적합도(4.2 ③)의 비콜드스타트 입력 */
function buildDifficultyAffinity(
  signals: PreferenceSignalInput[],
  contentsById: Map<string, Content>,
): Record<string, number> | null {
  const counts: Record<string, number> = {};
  let total = 0;

  for (const signal of signals) {
    if (signal.action !== PreferenceSignalAction.COMPLETE) {
      continue;
    }

    const difficulty = contentsById.get(signal.contentId)?.difficulty;

    if (!difficulty) {
      continue;
    }

    counts[difficulty] = (counts[difficulty] ?? 0) + 1;
    total += 1;
  }

  if (total === 0) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(counts).map(([difficulty, count]) => [
      difficulty,
      count / total,
    ]),
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/** 로그에 싣는 점수는 소수점 셋째 자리까지. `null`(축 제외)은 그대로 둔다 */
function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

function toArrivedContent(pick: ScoredCandidate): ArrivedContent {
  return { contentId: pick.content.id, title: pick.content.title };
}
