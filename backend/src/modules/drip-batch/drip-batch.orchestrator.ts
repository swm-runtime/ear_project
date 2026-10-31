import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { toServiceDate } from '@/common/utils/service-date.util';
import { ContentLengthProfile } from '@/modules/content/content.enum';
import { ContentCohortService } from '@/modules/content/services/content-cohort.service';
import { ContentService } from '@/modules/content/services/content.service';
import { ContentStatService } from '@/modules/content/services/content-stat.service';
import { SeriesEpisodeState } from '@/modules/content/content.types';
import { Content } from '@/modules/content/entities/content.entity';
import {
  COLD_START_COMPLETE_THRESHOLD,
  DRIP_BATCH_PAGE_FETCH_RETRY_DELAYS_MS,
  DRIP_BATCH_USER_PAGE_SIZE,
  DRIP_BATCH_USER_RETRY_DELAY_MS,
  DRIP_IGNORE_AFTER_DAYS,
  EXPOSURE_FATIGUE_LOOKBACK_DAYS,
  SCORING_POOL_LIMIT,
  SIGNAL_LOOKBACK_DAYS,
  SIGNAL_LOOKBACK_LIMIT,
  UNFINISHED_INVENTORY_LIMIT,
} from '@/modules/drip/drip.constant';
import {
  AutoExpandDecision,
  decideAutoExpand,
} from '@/modules/drip/auto-expand.policy';
import {
  DEFAULT_DRIP_GROUP,
  DripArrivalSlot,
  dripArrivalSlotOf,
  dripArrivalVariantOf,
  dripGroupOf,
  isAfterArrivalPushTime,
  isArrivalSlotActive,
  nextDripBatchAt,
} from '@/modules/drip/drip-group.policy';
import { scoringCareerOf } from '@/modules/drip/drip-career.policy';
import { DripGroup, PreferenceSignalAction } from '@/modules/drip/drip.enum';
import {
  PreferenceSignalInput,
  ScoredCandidate,
  ScoringCandidate,
  UserCareer,
  UserPreferenceWeights,
} from '@/modules/drip/drip.types';
import { DripBatchRun } from '@/modules/drip/entities/drip-batch-run.entity';
import { DripBatchRunService } from '@/modules/drip/services/drip-batch-run.service';
import { DripPlacementService } from '@/modules/drip/services/drip-placement.service';
import { DripScoringService } from '@/modules/drip/services/drip-scoring.service';
import { PreferenceVectorService } from '@/modules/drip/services/preference-vector.service';
import { UserInterest } from '@/modules/interest/entities/user-interest.entity';
import { UserInterestSource } from '@/modules/interest/interest.enum';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { DripArrival } from '@/modules/notification/notification.types';
import { DripArrivalNotificationService } from '@/modules/notification/services/drip-arrival-notification.service';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import {
  SeriesEpisodeAccess,
  isSeriesEpisodeLocked,
} from '@/modules/subscription/policies/series-paywall.policy';
import { PlanService } from '@/modules/subscription/services/plan.service';
import {
  SeriesPaywallService,
  SeriesPaidTierCache,
} from '@/modules/subscription/services/series-paywall.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserSettingService } from '@/modules/user/services/user-setting.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

import {
  DiscoveryPlan,
  DripPlanUser,
  PlanOptions,
  RegularPlan,
  UserDripPlan,
} from './drip-batch.types';
import { UserMarket } from '@/modules/user/user.enum';
import { MorningPushService } from '@/modules/retention-push/morning-push.service';

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

/** 편성 결과. 도착 알림은 07:00 에 그날 적립분을 DB 에서 다시 읽어 보낸다(`notifyTodayArrivals`) */
interface UserScheduleResult {
  outcome: UserOutcome;
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
  /** 자동 확장 서버 스위치(`AUTO_EXPAND_ENABLED`) — `true`를 명시했을 때만 켜진다. 비었거나 `false`면 꺼짐(`env.validation.ts` 주석) */
  private readonly autoExpandEnabled: boolean;
  /** 시간대 그룹 스위치(`DRIP_TIMEZONE_GROUPS_ENABLED`) — 꺼져 있으면 전원이 기본 그룹(05:00 KST)이다 */
  private readonly timezoneGroupsEnabled: boolean;
  /**
   * 시리즈 유료화(KAN-290)의 "유료 요금제인가" 캐시 — **실행 1회(`PlanCountCache` 하나)마다 따로 둔다.** 편수 캐시와 같은 수명이라
   * 사용자마다 요금제를 다시 읽지 않고, 실행이 끝나면 함께 버려진다
   */
  private readonly seriesPaidTierCaches = new WeakMap<
    PlanCountCache,
    SeriesPaidTierCache
  >();

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
    private readonly dripBatchRunService: DripBatchRunService,
    private readonly dripArrivalNotificationService: DripArrivalNotificationService,
    private readonly topicService: TopicService,
    private readonly userSettingService: UserSettingService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly contentCohortService: ContentCohortService,
    private readonly morningPushService: MorningPushService,
    private readonly seriesPaywallService: SeriesPaywallService,
  ) {
    // **`true`를 명시했을 때만 켠다**(2026-10-14). 종전 "운영(SENTRY_ENVIRONMENT=production)만 기본 꺼짐"은 운영의
    // 환경 이름이 비거나 오타면 자동 확장이 조용히 켜지는 구조였다 — 추천 테스트 콘솔과 같은 함정(2026-10-13 수정).
    // 개발계는 `.env.prod`(Secrets `ear/dev/api`)에 `true`를 명시해 켠다. 운영은 KAN-181 앱이 전원에게 나간 뒤 `true`
    this.autoExpandEnabled =
      configService.get('AUTO_EXPAND_ENABLED', { infer: true })?.trim() ===
      'true';
    this.timezoneGroupsEnabled =
      configService
        .get('DRIP_TIMEZONE_GROUPS_ENABLED', { infer: true })
        ?.trim() === 'true';
  }

  /** 그 그룹의 크론이 돌아야 하는가 — 스위치가 꺼져 있으면 기본 그룹만 돈다 */
  isGroupActive(group: DripGroup): boolean {
    return this.timezoneGroupsEnabled || group === DEFAULT_DRIP_GROUP;
  }

  /**
   * 도착 알림 시각 A/B(KAN-289) 서버 스위치 `DRIP_ARRIVAL_AB_ENABLED` — `true`를 명시했을 때만 켜진다. **부를 때마다 읽는다** —
   * 한 서비스 날짜 안에서 07:00·07:30·08:00 크론과 배치 종료가 같은 값을 보게 하는 것은 하루 1건 판정이 맡는다
   * (도중에 바꿔도 같은 날 두 번 가지 않는다 — 종류 머리 `drip_arrival`로 센다)
   */
  isArrivalAbEnabled(): boolean {
    return (
      this.configService
        .get('DRIP_ARRIVAL_AB_ENABLED', { infer: true })
        ?.trim() === 'true'
    );
  }

  /**
   * 배치 1회 실행. **같은 서비스 날짜에 두 번 적립되지 않는다** —
   * `drip_batch_runs (run_date, group)` 유니크 선점이 배치 단위를, `planForUser`의 `already_placed` 스킵이
   * 사용자 단위를 막는다(`drip-scheduling.md` 4.6-5 — `library_items` 유니크는 같은 콘텐츠만 막아
   * 사용자 단위 멱등의 근거가 아니다, 2026-09-26).
   *
   * `mode: 'resume'`은 **프로세스 재시작 직후의 재개**다(`DripBatchScheduler.onApplicationBootstrap`) —
   * 오늘 날짜의 미완료 실행(`finished_at` NULL)이 있으면 나이와 무관하게 이어받고, 정상 종료한 날은
   * 아무것도 하지 않는다. 배치가 중간에 죽는 원인이 곧 재시작이라, 재시작이 끝난 시점이 재개 시점이다.
   *
   * `group`은 발송 그룹(`global-api.md` 2.4)이다 — 그 그룹 사용자만 편성하고 실행 기록도 그룹마다 따로다.
   * 서비스 날짜는 그룹과 무관하게 05:00 KST 경계 그대로다(그룹의 현지 05:00은 같은 서비스 날짜 안에 있다).
   */
  async run(
    now: Date,
    mode: 'scheduled' | 'resume' = 'scheduled',
    group: DripGroup = DEFAULT_DRIP_GROUP,
  ): Promise<void> {
    const runDate = toServiceDate(now);
    const run = await this.dripBatchRunService.claim(runDate, group, now, {
      reclaimUnfinished: mode === 'resume',
    });

    if (!run) {
      this.logger.log(
        mode === 'resume'
          ? 'drip batch has no unfinished run to resume'
          : 'drip batch already claimed for the date',
        { run_date: runDate, group },
      );
      return;
    }

    if (mode === 'resume') {
      this.logger.warn('drip batch resuming an unfinished run', {
        run_date: runDate,
        group,
      });
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
     * 루프가 끝까지 돌았을 때만 실행 기록을 닫는다. 사용자 단위 실패는 아래에서 흡수되지만,
     * 페이지 조회처럼 루프 자체가 던지는 경로가 남아 있다 — 그때 `finish`로 `finished_at`을 찍으면
     * 남은 사용자는 그날 드립을 못 받는데 재실행까지 막힌다(2026-09-26 감사). 닫지 않고 던져 두면
     * 다음 재시작 때 `mode: 'resume'`이 이어받고(스케줄러 부팅 시 확인), `already_placed` 스킵이
     * 이미 받은 사용자를 건너뛴다. 던진 뒤 프로세스가 살아 있으면 다음 날 05:00 배치가 새 날짜로
     * 정상 시작한다.
     */
    let completed = false;

    try {
      for (;;) {
        const users: User[] = await this.findTargetsPageWithRetry(afterId);

        if (users.length === 0) {
          break;
        }

        for (const user of users) {
          // 대상 조회는 그룹을 모른다 — 시간대 오프셋이 시각마다 달라 SQL 로 가르지 않고 여기서 거른다
          if (this.groupOf(user, now) !== group) {
            continue;
          }

          counts.targetCount += 1;

          try {
            const { outcome } = await this.scheduleForUserWithRetry(
              user,
              now,
              planCounts,
            );

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

        afterId = users[users.length - 1].id;
      }

      completed = true;
    } finally {
      if (completed) {
        // 네 카운트 합 = targetCount (domain.md 7.3). exhausted는 2026-09-11부터 컬럼에 남는다 —
        // 그전엔 로그에만 있어 "대상 13 · 성공 3"의 나머지 10명이 표에서 사라졌다
        const finishedAt = new Date();
        await this.dripBatchRunService.finish(run, counts, finishedAt);

        // 끝난 시각이 알림 시각(현지 07:00 — A/B 켜짐이면 07:30·08:00 각각) 뒤면 그 시각의 알림 크론은 이미 지나갔다 —
        // 여기서 보낸다. **시작 시각이 아니라 끝난 시각으로 본다**(2026-10-15) — 05:00에 시작해 07:00을 넘겨 끝난 배치도,
        // 07:00 전에 시작한 재개도 그날 알림이 빠지지 않게. 크론은 같은 기준(`finished_at`)으로 이 경우를 건너뛰어 시각마다
        // 정확히 한쪽만 보낸다(`notifyTodayArrivals`)
        const abEnabled = this.isArrivalAbEnabled();
        const dueSlots = Object.values(DripArrivalSlot).filter(
          (slot) =>
            isArrivalSlotActive(slot, abEnabled) &&
            isAfterArrivalPushTime(finishedAt, group, slot),
        );

        if (dueSlots.length > 0) {
          await this.sendArrivals(
            run,
            finishedAt,
            finishedAt,
            group,
            dueSlots,
            abEnabled,
          );
        }

        // 아침 알림(KAN-288)도 같은 규칙이다 — 08:00 뒤에 끝났으면 08:00 크론은 건너뛰었으니 여기서 보낸다
        if (
          this.morningPushService.isGroupActive(group) &&
          isAfterArrivalPushTime(finishedAt, group, MORNING_PUSH_SLOT)
        ) {
          await this.sendMorningPush(run, finishedAt, finishedAt, group);
        }
      } else {
        this.logger.error(
          'drip batch aborted — run left open for the resume slot',
          {
            run_date: runDate,
            group,
            processed_count: counts.targetCount,
          },
        );
      }
    }

    // 건당 로그를 남기지 않고 실행 결과를 집계해 한 번 남긴다 (convention.md 8.3 — 드립 편성)
    this.logger.log('drip batch finished', {
      run_date: runDate,
      group,
      target_count: counts.targetCount,
      success_count: counts.successCount,
      skipped_count: counts.skippedCount,
      exhausted_count: counts.exhaustedCount,
      failed_count: counts.failedCount,
    });
  }

  private groupOf(user: User, now: Date): DripGroup {
    return this.timezoneGroupsEnabled
      ? dripGroupOf(user, now)
      : DEFAULT_DRIP_GROUP;
  }

  /** 페이지 조회 재시도(`DRIP_BATCH_PAGE_FETCH_RETRY_DELAYS_MS`) — 끝까지 실패하면 그대로 던진다 */
  private async findTargetsPageWithRetry(
    afterId: string | null,
  ): Promise<User[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.userService.findDripTargetsPage(
          afterId,
          DRIP_BATCH_USER_PAGE_SIZE,
        );
      } catch (error) {
        if (attempt >= DRIP_BATCH_PAGE_FETCH_RETRY_DELAYS_MS.length) {
          throw error;
        }

        this.logger.warn('drip target page fetch failed, retrying', {
          attempt: attempt + 1,
          error: toErrorMessage(error),
        });
        await sleep(DRIP_BATCH_PAGE_FETCH_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  /** 사용자 한 명의 편성을 한 번 더 시도한다(`DRIP_BATCH_USER_RETRY_DELAY_MS`). 두 번째 실패는 호출부가 센다 */
  private async scheduleForUserWithRetry(
    user: User,
    now: Date,
    planCounts: PlanCountCache,
  ): Promise<UserScheduleResult> {
    try {
      return await this.scheduleForUser(user, now, planCounts);
    } catch (error) {
      this.logger.warn('drip scheduling failed for user, retrying once', {
        user_id: user.id,
        error: toErrorMessage(error),
      });
      await sleep(DRIP_BATCH_USER_RETRY_DELAY_MS);

      return this.scheduleForUser(user, now, planCounts);
    }
  }

  /**
   * **드립 도착 알림 — 그룹 현지 07:00**(KR은 07:00 KST — `notification.md` 4.3, 2026-10-14 변경 · 그룹 `global-api.md` 2.4). 편성은 05:00에 그대로 하고 알림만 늦춘다 —
   * 새벽 5시 알림은 잠금화면에 묻혀 의미가 없었다. 그래서 배치는 알리지 않고, 이 경로가 **오늘 배치가 적립한 것을
   * DB 에서 다시 읽어** 사용자당 1건(정규 + 탐험)으로 보낸다.
   *
   * 범위는 그 그룹 실행 기록이 처음 생긴 시각(`created_at`)부터 배치 종료까지다 — 배치가 재개로 이어졌어도
   * (재개는 `started_at`만 바꾼다) 앞 구간이 빠지지 않고, 같은 날 먼저 돈 다른 그룹의 적립분은 들어오지 않는다.
   * 알림 전에 지운 편은 빠지고(소프트 삭제), 같은 날 두 번 보내지 않는 것은 알림 서비스의 하루 1건 판정이 막는다.
   *
   * **이 경로는 알림 크론이다.** 배치가 아직 끝나지 않았으면 보내지 않고, 그 시각(`slot`) 뒤에 끝난 실행도 건너뛴다 — 그
   * 경우는 배치가 끝나면서 보낸다(`run`). 두 경로가 같은 `finished_at`으로 판정해 한 실행은 시각마다 정확히 한쪽만 보낸다
   * (하루 1건 판정은 조회 뒤 발송이라 동시에 불리면 둘 다 통과한다).
   *
   * **시각 A/B(KAN-289, 2026-10-29)** — `slot`은 크론의 시각이다. 스위치가 꺼져 있으면 07:00 크론만 전원에게 보내고 07:30·08:00
   * 크론은 아무것도 하지 않는다(종전 그대로). 켜져 있으면 07:00 크론은 쉬고, 07:30은 A 그룹 · 08:00은 B 그룹에게만 보낸다
   * (그룹 = 사용자 id 해시, `dripArrivalSlotOf`). 대상·문구는 같고 기록 종류만 `drip_arrival.a`·`.b`로 갈린다.
   */
  async notifyTodayArrivals(
    now: Date,
    group: DripGroup = DEFAULT_DRIP_GROUP,
    slot: DripArrivalSlot = DripArrivalSlot.H0700,
  ): Promise<void> {
    const abEnabled = this.isArrivalAbEnabled();
    const sendsArrivals = isArrivalSlotActive(slot, abEnabled);
    // 아침 알림(KAN-288)은 08:00 크론에서만 — 스위치가 꺼져 있거나 다른 시각이면 하지 않는다
    const sendsMorning =
      slot === MORNING_PUSH_SLOT &&
      this.morningPushService.isGroupActive(group);

    if (!sendsArrivals && !sendsMorning) {
      return;
    }

    const runDate = toServiceDate(now);
    const run = await this.dripBatchRunService.findByRunDateAndGroup(
      runDate,
      group,
    );

    if (!run?.finishedAt) {
      this.logger.warn('drip arrival push skipped — batch not finished', {
        run_date: runDate,
        group,
        slot,
      });
      return;
    }

    if (isAfterArrivalPushTime(run.finishedAt, group, slot)) {
      this.logger.log(
        'drip arrival push left to the batch — it finished after push time',
        {
          run_date: runDate,
          group,
          slot,
        },
      );
      return;
    }

    if (sendsArrivals) {
      await this.sendArrivals(
        run,
        run.finishedAt,
        now,
        group,
        [slot],
        abEnabled,
      );
    }

    // 도착 알림을 먼저 보낸다 — 아침 알림은 오늘 적립받은 사용자와 이미 도착 알림을 받은 사용자를 뺀다(하루 1건)
    if (sendsMorning) {
      await this.sendMorningPush(run, run.finishedAt, now, group);
    }
  }

  /**
   * 아침 알림(KAN-288) — **드립이 없는 날**의 미청취 유도. 오늘 그 그룹 배치가 적립한 사용자(드립이 있는 날)는 도착 알림 몫이라
   * 뺀다. 실패해도 던지지 않는다 — 도착 알림·편성과 무관하다.
   */
  private async sendMorningPush(
    run: DripBatchRun,
    finishedAt: Date,
    now: Date,
    group: DripGroup,
  ): Promise<void> {
    try {
      const items = await this.libraryService.findPlacementsAddedBetween(
        run.createdAt,
        new Date(finishedAt.getTime() + 1),
      );

      await this.morningPushService.run(
        group,
        now,
        new Set(items.map((item) => item.userId)),
      );
    } catch (error) {
      this.logger.error('retention morning push failed', {
        run_date: run.runDate,
        group,
        error: toErrorMessage(error),
      });
    }
  }

  /**
   * 끝난 실행이 적립한 편을 다시 읽어 사용자당 1건으로 보낸다 — 크론·배치 두 경로가 함께 쓴다. `slots`의 시각을 받는
   * 사용자만 보낸다(A/B 꺼짐이면 07:00 = 전원)
   */
  private async sendArrivals(
    run: DripBatchRun,
    finishedAt: Date,
    now: Date,
    group: DripGroup,
    slots: DripArrivalSlot[],
    abEnabled: boolean,
  ): Promise<void> {
    const items = await this.libraryService.findPlacementsAddedBetween(
      run.createdAt,
      // 배치 종료 직후 같은 ms 에 적립된 행까지 넣는다(LessThan)
      new Date(finishedAt.getTime() + 1),
    );
    const arrivals = groupArrivals(items);
    // 알림 보관 시한 — 그 그룹의 다음 배치까지(americas 알림이 다음 05:00 KST에 만료되지 않게)
    const nextBatchAt = nextDripBatchAt(group, now);
    const userCountBySlot: Partial<Record<DripArrivalSlot, number>> = {};

    for (const slot of slots) {
      const targets = arrivals.filter(
        (arrival) => dripArrivalSlotOf(arrival.userId, abEnabled) === slot,
      );
      const variant = dripArrivalVariantOf(slot, abEnabled);
      userCountBySlot[slot] = targets.length;

      for (let i = 0; i < targets.length; i += ARRIVAL_PUSH_CHUNK) {
        await this.notifyArrivals(
          targets.slice(i, i + ARRIVAL_PUSH_CHUNK),
          now,
          nextBatchAt,
          variant,
        );
      }
    }

    this.logger.log('drip arrival push done', {
      run_date: run.runDate,
      group,
      user_count: Object.values(userCountBySlot).reduce(
        (sum, count) => sum + (count ?? 0),
        0,
      ),
      user_count_by_slot: userCountBySlot,
    });
  }

  /** 알림 실패는 편성을 되돌리지 않는다 — 적립은 이미 커밋됐다 */
  private async notifyArrivals(
    arrivals: DripArrival[],
    now: Date,
    nextBatchAt: Date,
    variant: string | null,
  ): Promise<void> {
    if (arrivals.length === 0) {
      return;
    }

    try {
      await this.dripArrivalNotificationService.notify(
        arrivals,
        now,
        nextBatchAt,
        variant,
      );
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
      persistAutoExpand: true,
      stopAtSkip: true,
      loadRecentDripTopics: false,
    });

    if (plan.skipReason !== null) {
      return { outcome: 'skipped' };
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
      } catch (error) {
        this.logger.warn('discovery scheduling failed', {
          user_id: user.id,
          error: toErrorMessage(error),
        });
      }
    }

    // 정규 편성이 0편이면 후보가 마른 것이다(4.1의 스킵 조건은 위에서 이미 걸렀다).
    // 탐험 슬롯만 채워졌더라도 본편이 없으면 그날의 편성은 성공이 아니다
    return {
      outcome: regularPicks.length > 0 ? 'scheduled' : 'exhausted',
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
    user: DripPlanUser,
    now: Date,
    planCounts: PlanCountCache,
    options: PlanOptions,
  ): Promise<UserDripPlan> {
    const plan: UserDripPlan = {
      userId: user.id,
      activeTopicIds: [],
      skipReason: null,
      placedTodayCount: null,
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
      autoExpand: null,
      regular: null,
      discovery: null,
      discoveryError: null,
    };

    // 관심사 0은 방어적 처리 — 정상 경로에서는 도달 불가(`drip-scheduling.md` 4.1)
    const activeInterests = await this.userInterestService.findAllActive(
      user.id,
    );
    plan.activeTopicIds = activeInterests.map((interest) => interest.topicId);

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

    /**
     * 행동 기반 자동 확장(4.5 — 개정 2026-09-30). 취향 캐시와 **같은 자리**에서 같은 신호로 판정한다 —
     * 적립 스킵(재고·이미 편성)보다 앞이라 스킵 사용자도 슬롯이 갱신되고, 후보 조회보다 앞이라 오늘 편성이
     * 바뀐 관심 주제로 계산된다. 미리보기는 저장하지 않되 **바뀐 것으로 가정하고** 계산한다 — 그래야
     * "지금 배치를 돌리면 무엇이 가는가"가 실제 배치와 같은 답이다.
     */
    plan.autoExpand = await this.resolveAutoExpand(
      user.id,
      user.market,
      activeInterests,
      preferenceResult,
      now,
    );
    plan.activeTopicIds = await this.applyAutoExpand(
      user.id,
      plan.activeTopicIds,
      plan.autoExpand,
      now,
      options.persistAutoExpand,
    );

    /**
     * 오늘 이미 편성된 사용자는 건너뛴다(4.6-5 `already_placed`) — 중단된 배치의 재실행이나 사용자 단위
     * 재시도가 같은 사용자에게 또 2+1편을 주지 않게 하는 **사용자 단위 멱등 판정**이다. 후보 SQL은 이미
     * 준 콘텐츠를 빼므로 이 판정이 없으면 재실행마다 새 편이 간다. 적립 규칙이라 취향 캐시 재계산 뒤에 둔다.
     */
    plan.placedTodayCount = await this.libraryService.countPlacedToday(
      user.id,
      now,
    );

    if (plan.placedTodayCount > 0) {
      plan.skipReason = 'already_placed';

      if (options.stopAtSkip) {
        return plan;
      }
    }

    // 미청취 재고 스킵(4.1) — 탐험 편성도 함께 건너뛴다(4.8)
    plan.unfinishedCount = await this.libraryService.countUnfinished(
      user.id,
      user.market,
    );

    if (plan.unfinishedCount >= UNFINISHED_INVENTORY_LIMIT) {
      // 오늘 이미 편성된 사유가 먼저 났으면 유지한다(배치가 보는 순서와 같다)
      plan.skipReason ??= 'unfinished_inventory';

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

    // 시리즈 유료화(KAN-290 — `experiments-api.md` 4.2-4) — 잠긴 편은 비프로 사용자에게 드립으로 주지 않는다(3편 완청 → 4편 안 옴)
    const seriesAccess = await this.seriesPaywallService.resolveAccess(
      user,
      now,
      undefined,
      this.seriesPaidTierCacheOf(planCounts),
    );

    // 짧은 판 코호트(KAN-298) — 정규·탐험 편성 모두 가입 시점 코호트와 같은 길이 프로필의 콘텐츠만 후보다(폴백 없음 — 재고가
    // 없으면 그날은 고갈이다). 시리즈 연속 편도 이 후보 풀에서 나온다
    const lengthProfile = this.contentCohortService.resolve(
      user.createdAt,
      user.market,
    );

    if (dripCount > 0) {
      plan.regular = await this.planRegular(user.id, {
        market: user.market,
        lengthProfile,
        activeTopicIds: plan.activeTopicIds,
        completedEpisodesBySeries: plan.completedEpisodesBySeries,
        preference: plan.preference,
        difficultyAffinity: plan.difficultyAffinity,
        isColdStart: plan.isColdStart,
        // 커리어 적합도(4.2 ③) — 프로필이라 신호가 없어도 쓴다. KR 시장만
        career: scoringCareerOf(user),
        dripCount,
        loadRecentDripTopics: options.loadRecentDripTopics,
        now,
        seriesAccess,
      });
    }

    // 탐험 계산 실패는 정규 편성을 되돌리지 않는다(4.8) — 사유만 남긴다
    try {
      if (discoveryCount > 0) {
        const regularPicks = plan.regular?.picks ?? [];

        plan.discovery = await this.planDiscovery(user.id, {
          market: user.market,
          lengthProfile,
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

  private seriesPaidTierCacheOf(
    planCounts: PlanCountCache,
  ): SeriesPaidTierCache {
    let cache = this.seriesPaidTierCaches.get(planCounts);

    if (!cache) {
      cache = new Map();
      this.seriesPaidTierCaches.set(planCounts, cache);
    }

    return cache;
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
   * 신호에서 파생되는 상태(취향 캐시·자동 확장 슬롯)를 **지금** 다시 계산해 저장한다 — 추천 테스트 콘솔 전용
   * (2026-09-29, 자동 확장 포함 2026-09-30).
   *
   * 제품에서는 배치만 이 둘을 쓴다(4.3 "실시간 재계산은 하지 않는다"). 테스트 콘솔은 "완청을 누르면 탐색 피드와
   * 편성이 어떻게 바뀌나"를 바로 봐야 하므로, 다음 배치가 할 일을 행동 직후 같은 함수로 앞당긴다.
   * 계산식은 배치와 하나다 — 여기서 다른 계산을 하면 콘솔이 보는 결과가 제품과 갈라진다.
   */
  async refreshDerivedState(
    userId: string,
    market: UserMarket,
    now: Date,
  ): Promise<AutoExpandDecision> {
    const activeInterests =
      await this.userInterestService.findAllActive(userId);
    const preferenceResult = await this.rebuildPreference(userId, now, true);
    const decision = await this.resolveAutoExpand(
      userId,
      market,
      activeInterests,
      preferenceResult,
      now,
    );
    await this.applyAutoExpand(
      userId,
      activeInterests.map((interest) => interest.topicId),
      decision,
      now,
      true,
    );

    return decision;
  }

  /**
   * 자동 확장 판정(4.5). 순수 판정(`decideAutoExpand`)에 **조회가 필요한 두 조건**을 얹는다 — 후보 주제가
   * 지금 고를 수 있는 주제인가(숨김 주제는 `findAllActive`가 걸러 버려 넣어도 유령 행이 된다. **다른 시장
   * 주제도 같은 길로 뺀다** — 시장 전환 뒤 이전 시장 청취 신호가 이전 시장 주제를 되살리지 않게, global-api 4.5
   * "자동 확장도 같은 시장 안에서만"), 그리고
   * 사용자가 자동 확장을 켜 두었는가(FR-06). 둘 다 **움직일 일이 있을 때만** 조회한다. 그 밖에 사용자마다
   * 드는 조회는 `user_interests` 한 번(직접 해제한 주제 + 숨김 주제가 차지한 자동 슬롯)이다.
   *
   * **숨김 주제가 차지한 자동 슬롯은 여기서 비운다**(4.5-1 "숨김") — 숨긴 순간이 아니라 배치에서 하는 이유는
   * 비용이다: 배치는 어차피 사용자마다 취향을 다시 계산하므로 추가 조회 없이 얹힌다.
   */
  private async resolveAutoExpand(
    userId: string,
    market: UserMarket,
    activeInterests: UserInterest[],
    preferenceResult: {
      signals: PreferenceSignalInput[];
      topicIdsByContentId: Map<string, string[]>;
      preference: UserPreferenceWeights;
    },
    now: Date,
  ): Promise<AutoExpandDecision> {
    const { userRemovedTopicIds, activeAutoExpandTopicIds } =
      await this.userInterestService.findAutoExpandState(userId);
    // `activeInterests`는 노출 중인 주제만이다 — 거기 없는 활성 자동 슬롯은 숨김 주제가 차지한 것이다
    const visibleTopicIds = new Set(
      activeInterests.map((interest) => interest.topicId),
    );
    const input = {
      now,
      signals: preferenceResult.signals,
      topicIdsByContentId: preferenceResult.topicIdsByContentId,
      topicWeights: preferenceResult.preference.topicWeights,
      activeInterests: activeInterests.map((interest) => ({
        topicId: interest.topicId,
        isAutoExpand: interest.source === UserInterestSource.AUTO_EXPAND,
        activatedAt: interest.updatedAt,
      })),
      userRemovedTopicIds,
      hiddenSlotTopicIds: activeAutoExpandTopicIds.filter(
        (topicId) => !visibleTopicIds.has(topicId),
      ),
    };
    let decision = decideAutoExpand(input);

    if (decision.candidates.length > 0) {
      const candidateIds = decision.candidates.map(
        (candidate) => candidate.topicId,
      );
      const topics = await this.topicService.findAllByIds(candidateIds);
      const selectable = new Set(
        topics
          .filter((topic) => topic.isVisible && topic.market === market)
          .map((topic) => topic.id),
      );
      const unavailableTopicIds = candidateIds.filter(
        (topicId) => !selectable.has(topicId),
      );

      if (unavailableTopicIds.length > 0) {
        decision = decideAutoExpand({ ...input, unavailableTopicIds });
      }
    }

    if (decision.action === 'none') {
      return decision;
    }

    const off = (reason: 'feature_off' | 'disabled'): AutoExpandDecision => ({
      ...decision,
      action: 'none',
      reason,
      addTopicId: null,
      removeTopicId: null,
    });

    // 서버 스위치가 꺼져 있으면 판정 재료(후보)만 싣고 움직이지 않는다 — 콘솔에서 "켜면 무엇이 붙는가"는 보인다
    if (!this.autoExpandEnabled) {
      return off('feature_off');
    }

    const settings = await this.userSettingService.getSettings(userId);

    // 끈 사용자는 넣지도 빼지도 않는다 — 이미 자동 추가된 주제는 그대로 남는다(`interest-management.md` 4.3)
    return settings.isAutoExpandEnabled ? decision : off('disabled');
  }

  /**
   * 판정을 관심 주제 목록에 반영해 **편성이 쓸 주제 집합**을 돌려준다. `persist`면 저장하고 실제로 바뀐 것만
   * 반영하고(판정과 저장 사이에 사용자가 관리 화면에서 저장했을 수 있다), 아니면 바뀐 것으로 가정만 한다.
   */
  private async applyAutoExpand(
    userId: string,
    activeTopicIds: string[],
    decision: AutoExpandDecision,
    now: Date,
    persist: boolean,
  ): Promise<string[]> {
    if (decision.action === 'none') {
      return activeTopicIds;
    }

    const applied = persist
      ? await this.userInterestService.applyAutoExpand(
          userId,
          {
            addTopicId: decision.addTopicId,
            removeTopicId: decision.removeTopicId,
          },
          now,
        )
      : {
          addedTopicId: decision.addTopicId,
          removedTopicId: decision.removeTopicId,
        };

    const next = activeTopicIds.filter(
      (topicId) => topicId !== applied.removedTopicId,
    );

    if (applied.addedTopicId !== null && !next.includes(applied.addedTopicId)) {
      next.push(applied.addedTopicId);
    }

    return next;
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
      topicIdsByContentId,
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
      career: UserCareer | null;
      dripCount: number;
      loadRecentDripTopics: boolean;
      now: Date;
      market: UserMarket;
      lengthProfile: ContentLengthProfile;
      /** 시리즈 유료화(KAN-290) — 이 사용자에게 잠긴 편은 후보가 아니다 */
      seriesAccess: SeriesEpisodeAccess;
    },
  ): Promise<RegularPlan> {
    const fetched = await this.contentService.findCandidates({
      market: input.market,
      lengthProfile: input.lengthProfile,
      includeTopicIds: input.activeTopicIds,
      excludeSeenByUserId: userId,
      // 시리즈 순서는 아래 filterEpisodeOrder가 판정한다 — 완청한 다음 편은 허용해야 한다
      seriesStartOnly: false,
      limit: SCORING_POOL_LIMIT,
      now: input.now,
    });
    // 잠긴 편(KAN-290)은 후보에서 뺀다 — 시리즈 순서 판정은 아래 편 상태에서 잠긴 편을 "줄 수 없는 편"으로 본다
    const pool = fetched.filter(
      (content) => !isSeriesEpisodeLocked(content, input.seriesAccess),
    );

    const candidates = await this.buildScoringCandidates(pool);
    // 다음 편 판정은 풀이 아니라 카탈로그의 노출 중인 편과 사용자 상태로 한다(KAN-134 규칙 ②′) — 풀은 상한으로 잘리고 본 편을 뺀다
    const seriesEpisodesBySeries = lockSeriesEpisodes(
      await this.contentService.findSeriesEpisodeStates(
        pool
          .map((content) => content.seriesId)
          .filter((seriesId): seriesId is string => seriesId !== null),
        userId,
        input.now,
        input.market,
      ),
      input.seriesAccess,
    );
    const gated = this.dripScoringService.filterEpisodeOrder(
      candidates,
      input.completedEpisodesBySeries,
      seriesEpisodesBySeries,
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
        seriesEpisodesBySeries,
        recentDripTopicIds: [],
        scored: [],
        picks: [],
      };
    }

    // 스코어링에는 쓰지 않는다(노출 피로 폐기 2026-09-25) — 편성 미리보기가 "최근 편성 주제"로 보여 주기만 한다
    const recentDripTopicIds = input.loadRecentDripTopics
      ? await this.findRecentDripTopicIds(userId, input.now)
      : [];

    const scored = this.dripScoringService.scoreRegularCandidates(gated, {
      activeTopicIds: input.activeTopicIds,
      preference: input.preference,
      difficultyAffinity: input.difficultyAffinity,
      completedEpisodesBySeries: input.completedEpisodesBySeries,
      seriesEpisodesBySeries,
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
      seriesEpisodesBySeries,
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
      market: UserMarket;
      lengthProfile: ContentLengthProfile;
    },
  ): Promise<DiscoveryPlan> {
    const pool = await this.contentService.findCandidates({
      market: input.market,
      lengthProfile: input.lengthProfile,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/** 로그에 싣는 점수는 소수점 셋째 자리까지. `null`(축 제외)은 그대로 둔다 */
function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

/** 한 번에 알림 서비스로 넘기는 사용자 수 — 발송 요청을 이 크기로 나눈다 */
const ARRIVAL_PUSH_CHUNK = 100;
/** 아침 알림(KAN-288)의 시각 — 광고성이라 야간 금지(21~08시) 밖인 08:00. A/B의 B 그룹 도착 알림과 같은 크론이다 */
const MORNING_PUSH_SLOT = DripArrivalSlot.H0800;

/** 적립 행 → 사용자별 도착 1건(정규·탐험) */
function groupArrivals(items: LibraryItem[]): DripArrival[] {
  const byUser = new Map<string, DripArrival>();

  for (const item of items) {
    const arrival: DripArrival = byUser.get(item.userId) ?? {
      userId: item.userId,
      regular: [],
      discovery: [],
    };
    const arrived = {
      contentId: item.contentId,
      title: item.content.title,
      market: item.content.market,
    };

    if (item.source === LibraryItemSource.DISCOVERY) {
      arrival.discovery.push(arrived);
    } else {
      arrival.regular.push(arrived);
    }

    byUser.set(item.userId, arrival);
  }

  return [...byUser.values()];
}

/**
 * 시리즈 유료화(KAN-290) — 잠긴 편을 **줄 수 없는 편**(`excluded`)으로 표시한다. 다음 편 고르기(`pickSeriesEpisode`)가 잠긴 편을
 * 건너뛰므로, 3편까지 완청한 무료 사용자에게는 4편이 "다음 편"으로 뽑히지 않고(앞쪽 빈 편이 있으면 그 편이 간다), 시리즈가
 * 그날 아무 편도 내지 않는다. 잠금이 없으면(스위치 꺼짐·열리는 사람) 입력을 그대로 돌려준다
 */
export function lockSeriesEpisodes(
  bySeries: Map<string, SeriesEpisodeState[]>,
  access: SeriesEpisodeAccess,
): Map<string, SeriesEpisodeState[]> {
  if (access.lockedAfterEpisodeNo === null) {
    return bySeries;
  }

  return new Map(
    [...bySeries].map(([seriesId, episodes]) => [
      seriesId,
      episodes.map((episode) =>
        isSeriesEpisodeLocked(
          { seriesId, episodeNo: episode.episodeNo },
          access,
        )
          ? { ...episode, excluded: true }
          : episode,
      ),
    ]),
  );
}
