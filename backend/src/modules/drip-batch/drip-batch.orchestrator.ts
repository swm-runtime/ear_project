import { Injectable, Logger } from '@nestjs/common';

import { toServiceDate } from '@/common/utils/service-date.util';
import { ContentService } from '@/modules/content/services/content.service';
import { ContentStatService } from '@/modules/content/services/content-stat.service';
import { Content } from '@/modules/content/entities/content.entity';
import {
  COLD_START_COMPLETE_THRESHOLD,
  DRIP_BATCH_USER_PAGE_SIZE,
  EXPOSURE_FATIGUE_LOOKBACK_DAYS,
  SCORING_POOL_LIMIT,
  SIGNAL_LOOKBACK_DAYS,
  SIGNAL_LOOKBACK_LIMIT,
  UNFINISHED_INVENTORY_LIMIT,
} from '@/modules/drip/drip.constant';
import { PreferenceSignalAction } from '@/modules/drip/drip.enum';
import {
  PreferenceSignalInput,
  ScoringCandidate,
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
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 사용자 단위 처리 결과 — `drip_batch_runs`의 카운트로 접힌다(domain.md 7.3) */
type UserOutcome = 'scheduled' | 'skipped';

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
      this.logger.log('drip batch already claimed for the date', { runDate });
      return;
    }

    const counts = {
      targetCount: 0,
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };

    let afterId: string | null = null;

    for (;;) {
      const users: User[] = await this.userService.findDripTargetsPage(
        afterId,
        DRIP_BATCH_USER_PAGE_SIZE,
      );

      if (users.length === 0) {
        break;
      }

      for (const user of users) {
        counts.targetCount += 1;

        try {
          const outcome = await this.scheduleForUser(user, now);

          if (outcome === 'scheduled') {
            counts.successCount += 1;
          } else {
            counts.skippedCount += 1;
          }
        } catch (error) {
          counts.failedCount += 1;
          this.logger.warn('drip scheduling failed for user', {
            userId: user.id,
            error: toErrorMessage(error),
          });
        }
      }

      afterId = users[users.length - 1].id;
    }

    await this.dripBatchRunService.finish(run, counts, new Date());

    // 건당 로그를 남기지 않고 실행 결과를 집계해 한 번 남긴다 (convention.md 8.3 — 드립 편성)
    this.logger.log('drip batch finished', { runDate, ...counts });
  }

  private async scheduleForUser(user: User, now: Date): Promise<UserOutcome> {
    // 관심사 0은 방어적 처리 — 정상 경로에서는 도달 불가(`drip-scheduling.md` 4.1)
    const activeTopicIds = await this.userInterestService.findActiveTopicIds(
      user.id,
    );

    if (activeTopicIds.length === 0) {
      return 'skipped';
    }

    // 미청취 재고 스킵(4.1) — 탐험 편성도 함께 건너뛴다(4.8)
    const unfinishedCount = await this.libraryService.countUnfinished(user.id);

    if (unfinishedCount >= UNFINISHED_INVENTORY_LIMIT) {
      return 'skipped';
    }

    const dripCount = await this.planService.getDailyDripCount(user.tier);
    const discoveryCount = await this.planService.getDailyDiscoveryCount(
      user.tier,
    );

    if (dripCount <= 0 && discoveryCount <= 0) {
      return 'skipped';
    }

    const { preference, difficultyAffinity, isColdStart } =
      await this.rebuildPreference(user.id, now);

    const excludedContentIds = await this.findExcludedContentIds(user.id);
    const completedEpisodesBySeries =
      await this.libraryService.findCompletedSeriesMaxEpisodes(user.id);

    const regularPicks =
      dripCount > 0
        ? await this.scheduleRegular(user.id, {
            activeTopicIds,
            excludedContentIds,
            completedEpisodesBySeries,
            preference,
            difficultyAffinity,
            isColdStart,
            dripCount,
            now,
          })
        : { ids: [], topicIds: [] };

    // 탐험 실패는 정규 편성을 되돌리지 않는다(4.8 — 부가 슬롯이 본편을 막으면 안 된다)
    try {
      if (discoveryCount > 0) {
        await this.scheduleDiscovery(user.id, {
          activeTopicIds,
          excludedContentIds: [...excludedContentIds, ...regularPicks.ids],
          pickedTopicIds: regularPicks.topicIds,
          discoveryCount,
          now,
        });
      }
    } catch (error) {
      this.logger.warn('discovery scheduling failed', {
        userId: user.id,
        error: toErrorMessage(error),
      });
    }

    return 'scheduled';
  }

  /** 4.3 — 배치 시점에 최신 신호를 읽어 취향 캐시를 재계산한다 */
  private async rebuildPreference(userId: string, now: Date) {
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

    const signalContentIds = [
      ...new Set(signals.map((signal) => signal.contentId)),
    ];
    const signalContents =
      await this.contentService.findAllByIds(signalContentIds);
    const contentsById = new Map(
      signalContents.map((content) => [content.id, content]),
    );
    const topicIdsByContentId = await this.buildTopicIdMap(signalContentIds);

    // 값 집합이 같은 두 enum의 매핑은 Orchestrator의 몫이다 (drip.enum.ts 참고)
    const preferenceSignals: PreferenceSignalInput[] = signals.map(
      (signal) => ({
        contentId: signal.contentId,
        action: signal.action as string as PreferenceSignalAction,
        createdAt: signal.createdAt,
      }),
    );

    const preference = await this.preferenceVectorService.rebuild(
      userId,
      preferenceSignals,
      contentsById,
      topicIdsByContentId,
      completeSignalCount,
      now,
    );

    return {
      preference,
      difficultyAffinity: buildDifficultyAffinity(
        preferenceSignals,
        contentsById,
      ),
      isColdStart: completeSignalCount < COLD_START_COMPLETE_THRESHOLD,
    };
  }

  private async scheduleRegular(
    userId: string,
    input: {
      activeTopicIds: string[];
      excludedContentIds: string[];
      completedEpisodesBySeries: Map<string, number>;
      preference: UserPreferenceWeights | null;
      difficultyAffinity: Record<string, number> | null;
      isColdStart: boolean;
      dripCount: number;
      now: Date;
    },
  ): Promise<{ ids: string[]; topicIds: string[] }> {
    const pool = await this.contentService.findCandidates({
      includeTopicIds: input.activeTopicIds,
      excludeContentIds: input.excludedContentIds,
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

    if (gated.length === 0) {
      // 고갈 — 대체 없이 그날 적립을 건너뛴다(`drip-scheduling.md` 7, 합의 2026-08-06)
      return { ids: [], topicIds: [] };
    }

    const recentDripTopicIds = await this.findRecentDripTopicIds(
      userId,
      input.now,
    );

    const scored = this.dripScoringService.scoreRegularCandidates(gated, {
      activeTopicIds: input.activeTopicIds,
      preference: input.preference,
      difficultyAffinity: input.difficultyAffinity,
      completedEpisodesBySeries: input.completedEpisodesBySeries,
      recentDripTopicIds,
      isColdStart: input.isColdStart,
      now: input.now,
    });

    const picks = this.dripScoringService.selectWithDiversity(
      scored,
      input.dripCount,
    );

    await this.dripPlacementService.placeItems(
      userId,
      picks.map((pick) => pick.content.id),
      LibraryItemSource.DRIP,
      input.now,
    );

    return {
      ids: picks.map((pick) => pick.content.id),
      topicIds: [...new Set(picks.flatMap((pick) => pick.topicIds))],
    };
  }

  /** 탐험 편성(4.8) — 관심 주제 교집합 필터만 우회하고 나머지 필터는 동일하다 */
  private async scheduleDiscovery(
    userId: string,
    input: {
      activeTopicIds: string[];
      excludedContentIds: string[];
      pickedTopicIds: string[];
      discoveryCount: number;
      now: Date;
    },
  ): Promise<void> {
    const pool = await this.contentService.findCandidates({
      excludeContentIds: input.excludedContentIds,
      // 탐험 편은 시리즈 도입부만 — 처음 보는 주제를 3편부터 줄 이유가 없다
      seriesStartOnly: true,
      limit: SCORING_POOL_LIMIT,
      now: input.now,
    });

    const candidates = await this.buildScoringCandidates(pool);

    if (candidates.length === 0) {
      return;
    }

    const [exposureCounts, userRemovedTopicIds] = await Promise.all([
      this.libraryService.countExposures(
        candidates.map((candidate) => candidate.content.id),
      ),
      this.userInterestService.findUserRemovedTopicIds(userId),
    ]);

    const picks = this.dripScoringService.selectDiscovery({
      candidates,
      exposureCounts,
      activeTopicIds: input.activeTopicIds,
      userRemovedTopicIds,
      pickedTopicIds: input.pickedTopicIds,
      count: input.discoveryCount,
      now: input.now,
    });

    await this.dripPlacementService.placeItems(
      userId,
      picks.map((pick) => pick.content.id),
      LibraryItemSource.DISCOVERY,
      input.now,
    );
  }

  /** 후보 콘텐츠에 스코어링 입력(전체 구간 집계·주제)을 붙인다 */
  private async buildScoringCandidates(
    pool: Content[],
  ): Promise<ScoringCandidate[]> {
    const poolIds = pool.map((content) => content.id);
    const [statsById, topicIdsByContentId] = await Promise.all([
      this.contentStatService.findAllTimeCounts(poolIds),
      this.buildTopicIdMap(poolIds),
    ]);

    return pool.map((content) => ({
      content,
      playCount: statsById.get(content.id)?.playCount ?? 0,
      completeCount: statsById.get(content.id)?.completeCount ?? 0,
      topicIds: topicIdsByContentId.get(content.id) ?? [],
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

  /** 노출 피로(4.2 ③) — 최근 편성분(드립·탐험)의 주제 */
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

  /** 중복 방지 필터(FR-16) — `library_items` + `drip_excluded_contents` 합집합(4.2) */
  private async findExcludedContentIds(userId: string): Promise<string[]> {
    const [inLibrary, excluded] = await Promise.all([
      this.libraryService.findAllContentIds(userId),
      this.dripExclusionService.findExcludedContentIds(userId),
    ]);

    return [...new Set([...inLibrary, ...excluded])];
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
