import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ContentCohortService } from '@/modules/content/services/content-cohort.service';
import { SeriesPaywallService } from '@/modules/subscription/services/series-paywall.service';
import { EnvironmentVariables } from '@/config/env.validation';
import {
  serviceDateStart,
  shiftServiceDate,
  shiftWeekStart,
  toCurrentWeekStart,
  toServiceDate,
  toWeekDates,
} from '@/common/utils/service-date.util';
import {
  DEFAULT_DRIP_GROUP,
  dripGroupOf,
} from '@/modules/drip/drip-group.policy';
import { DripGroup } from '@/modules/drip/drip.enum';
import { TargetedPushService } from '@/modules/notification/services/targeted-push.service';
import { messageLanguageOf } from '@/modules/user/policies/market.policy';
import { UserMarket } from '@/modules/user/user.enum';

import {
  MORNING_PUSH_LOG_TYPE_PREFIX,
  RETENTION_DRY_RUN_SAMPLES_PER_RULE,
  RETENTION_LOG_TYPE_PREFIX,
  RETENTION_PUSH_LISTENED_WINDOW_HOURS,
  RETENTION_PUSH_TTL_SEC,
  RETENTION_PUSH_WEEKLY_WINDOW_HOURS,
} from './retention-push.constant';
import { RetentionPushMode, RetentionRuleKey } from './retention-push.enum';
import {
  parseRetentionLogType,
  planRetentionPush,
  retentionLogType,
} from './retention-push.policy';
import { RetentionPushRepository } from './retention-push.repository';
import {
  RESUME_CONTENT_RECENT_DAYS,
  RETENTION_PEERS_WINDOW_MINUTES,
} from './retention-push.rules';
import {
  RetentionMarketFacts,
  RetentionPushPlan,
  RetentionPushSummary,
  RetentionSentRecord,
} from './retention-push.types';

const HOUR_MS = 60 * 60 * 1000;
/** 사용자별 사실 조회 한 번의 크기 */
const FACTS_CHUNK_SIZE = 1000;
/** 연속 기록을 셀 때 보는 날 수 */
const STREAK_LOOKBACK_DAYS = 60;

/**
 * 저녁 리텐션 알림(`notification.md` 4.6, KAN-272) — 그룹의 현지 18:00에 한 번 돈다.
 *
 * 대상(마케팅 동의 · 온보딩 완료 · 보낼 기기) → 사용자별 사실과 시장 집계 → 규칙 판정(`retention-push.policy.ts`) →
 * `RETENTION_PUSH_MODE`가 `on`이면 보내고, `dry_run`이면 보내지 않는다. 결과는 로그 한 줄로만 남긴다(규칙별 건수 —
 * `dry_run`이면 규칙마다 문구 예시까지). 팀 채널로 보내지 않는다 — 켜기 전 몇 번만 사람이 로그로 확인하면 되고, 그 뒤 성과는
 * `notification_logs`(종류 = 규칙·변형)로 본다(2026-10-26 결정)
 *
 * 같은 그룹이 두 번 돌아도(재시작 등) 최근 20시간 1건 제한이 두 번째를 막는다 — 실행 기록 표를 따로 두지 않는다.
 */
@Injectable()
export class RetentionPushService {
  private readonly logger = new Logger(RetentionPushService.name);
  private readonly mode: RetentionPushMode;
  private readonly timezoneGroupsEnabled: boolean;
  /** `dry_run`에서도 실제로 보내는 시험 대상 — 비면 `dry_run`은 아무에게도 보내지 않는다 */
  private readonly testUserIds: ReadonlySet<string>;

  constructor(
    private readonly repository: RetentionPushRepository,
    private readonly targetedPushService: TargetedPushService,
    configService: ConfigService<EnvironmentVariables, true>,
    private readonly contentCohortService: ContentCohortService,
    private readonly seriesPaywallService: SeriesPaywallService,
  ) {
    this.mode = toMode(
      configService.get('RETENTION_PUSH_MODE', { infer: true }),
    );
    this.timezoneGroupsEnabled =
      configService
        .get('DRIP_TIMEZONE_GROUPS_ENABLED', { infer: true })
        ?.trim() === 'true';
    this.testUserIds = parseTestUserIds(
      configService.get('RETENTION_PUSH_TEST_USER_IDS', { infer: true }),
    );
  }

  get currentMode(): RetentionPushMode {
    return this.mode;
  }

  /** 드립과 같은 그룹 규칙 — 시간대 그룹이 꺼져 있으면 기본 그룹(asia) 하나가 전원을 맡는다 */
  isGroupActive(group: DripGroup): boolean {
    return (
      this.mode !== RetentionPushMode.OFF &&
      (this.timezoneGroupsEnabled || group === DEFAULT_DRIP_GROUP)
    );
  }

  async run(group: DripGroup, now: Date): Promise<RetentionPushSummary> {
    const plans = await this.planGroup(group, now);
    const summary: RetentionPushSummary = {
      audience: plans.audience,
      planned: plans.items.length,
      byRule: countByRule(plans.items),
      sent: 0,
      failed: 0,
    };

    // on 이면 전원, dry_run 이면 시험 대상만 실제로 보낸다 — 시험 대상 판정도 전원과 같은 규칙·빈도 제한을 거친다
    const sending =
      this.mode === RetentionPushMode.ON
        ? plans.items
        : this.mode === RetentionPushMode.DRY_RUN
          ? plans.items.filter((plan) => this.testUserIds.has(plan.userId))
          : [];

    if (sending.length > 0) {
      const result = await this.targetedPushService.send(
        sending.map((plan) => ({
          userId: plan.userId,
          type: retentionLogType(plan.ruleKey, plan.variant),
          title: plan.title,
          body: plan.body,
          deepLink: plan.deepLink,
          ttl: RETENTION_PUSH_TTL_SEC,
        })),
        now,
      );
      summary.sent = result.sent;
      summary.failed = result.failed;
    }

    this.logger.log('retention push processed', {
      group,
      mode: this.mode,
      audience: summary.audience,
      planned: summary.planned,
      by_rule: summary.byRule,
      sent: summary.sent,
      failed: summary.failed,
      ...(this.mode === RetentionPushMode.DRY_RUN
        ? {
            samples: sampleCopies(plans.items),
            // 시험 대상 수와 그중 이번에 보내려 한(규칙 성립) 수만 — 사용자 id 는 싣지 않는다
            test_users: this.testUserIds.size,
            test_sending: sending.length,
          }
        : {}),
    });

    return summary;
  }

  /** 대상과 알림을 정한다 — 보내지 않는다 */
  async planGroup(
    group: DripGroup,
    now: Date,
  ): Promise<{ audience: number; items: RetentionPushPlan[] }> {
    const audience = (await this.repository.findAudience()).filter(
      (user) =>
        (this.timezoneGroupsEnabled
          ? dripGroupOf(user, now)
          : DEFAULT_DRIP_GROUP) === group,
    );
    const deliverable = await this.targetedPushService.filterDeliverableUserIds(
      audience.map((user) => user.userId),
    );
    const targets = audience.filter((user) => deliverable.has(user.userId));

    if (targets.length === 0) {
      return { audience: 0, items: [] };
    }

    const listenedSince = new Date(
      now.getTime() - RETENTION_PUSH_LISTENED_WINDOW_HOURS * HOUR_MS,
    );
    // "오늘" = 현지 05:00의 서비스 날짜 — americas 의 18:00은 KST 다음 날 아침이라 now 로 세면 하루 밀린다
    const today = toServiceDate(listenedSince);
    const weekStart = toCurrentWeekStart(listenedSince);
    const weekDates = toWeekDates(weekStart);
    const weekEnd = serviceDateStart(shiftWeekStart(weekStart, 1));
    const userIds = targets.map((user) => user.userId);

    const [history, facts, marketFacts] = await Promise.all([
      this.findHistory(userIds, now),
      this.findFacts(userIds, weekDates, listenedSince, today, now),
      this.findMarketFacts(
        [...new Set(targets.map((user) => user.market))],
        weekDates,
        weekEnd,
        now,
      ),
    ]);

    const items: RetentionPushPlan[] = [];

    for (const user of targets) {
      const fact = facts.get(user.userId);
      const market = marketFacts.get(user.market);

      if (!fact || !market) {
        continue;
      }

      const plan = planRetentionPush({
        user: {
          userId: user.userId,
          market: user.market,
          listenedRecently: fact.listenedRecently,
          weekListenedSec: fact.weekListenedSec,
          streakDays: countStreak(fact.recentPlayDates, today),
          resume: fact.resume,
        },
        market,
        history: history.get(user.userId) ?? [],
        language: messageLanguageOf(user.market),
        weekStart,
        now,
      });

      if (plan) {
        items.push(plan);
      }
    }

    return { audience: targets.length, items };
  }

  private async findHistory(
    userIds: string[],
    now: Date,
  ): Promise<Map<string, RetentionSentRecord[]>> {
    const rows = await this.targetedPushService.findSentHistory(
      userIds,
      RETENTION_LOG_TYPE_PREFIX,
      new Date(now.getTime() - RETENTION_PUSH_WEEKLY_WINDOW_HOURS * HOUR_MS),
    );
    const byUser = new Map<string, RetentionSentRecord[]>();

    for (const row of rows) {
      // 아침 알림(KAN-288)은 저녁 상한(20시간 1건 · 주 3건)에 세지 않는다 — 08:00 알림이 같은 날 18:00을 막지 않게(결정 2026-10-29)
      if (row.type.startsWith(MORNING_PUSH_LOG_TYPE_PREFIX)) {
        continue;
      }

      const ruleKey = parseRetentionLogType(row.type);

      // 지운 규칙의 지난 기록도 하루·주간 상한에는 센다 — 쿨다운만 의미가 없다
      byUser.set(row.userId, [
        ...(byUser.get(row.userId) ?? []),
        {
          ruleKey: ruleKey ?? (row.type as RetentionRuleKey),
          sentAt: row.sentAt,
        },
      ]);
    }

    return byUser;
  }

  private async findFacts(
    userIds: string[],
    weekDates: string[],
    listenedSince: Date,
    today: string,
    now: Date,
  ): Promise<
    Map<
      string,
      Awaited<ReturnType<RetentionPushRepository['findUserFacts']>>[number]
    >
  > {
    const facts = new Map<
      string,
      Awaited<ReturnType<RetentionPushRepository['findUserFacts']>>[number]
    >();
    // 시리즈 유료화(KAN-290 — `experiments-api.md` 4.2-4) — "듣던 콘텐츠"는 이 사용자에게 잠긴 편을 고르지 않는다. 판정 입력은 실행당 한 번
    const seriesLock = await this.seriesPaywallService.resolveSqlParams();

    for (let i = 0; i < userIds.length; i += FACTS_CHUNK_SIZE) {
      const rows = await this.repository.findUserFacts({
        userIds: userIds.slice(i, i + FACTS_CHUNK_SIZE),
        weekDates,
        listenedSince,
        playDatesSince: shiftServiceDate(today, -STREAK_LOOKBACK_DAYS),
        resumeSince: new Date(
          now.getTime() - RESUME_CONTENT_RECENT_DAYS * 24 * HOUR_MS,
        ),
        // 짧은 판 코호트(KAN-298) — "듣던 콘텐츠"는 사용자 코호트와 같은 길이 프로필만 고른다
        shortCohortSince: this.contentCohortService.cohortSince(),
        seriesLock,
        now,
      });

      for (const row of rows) {
        facts.set(row.userId, row);
      }
    }

    return facts;
  }

  private async findMarketFacts(
    markets: UserMarket[],
    weekDates: string[],
    weekEnd: Date,
    now: Date,
  ): Promise<Map<UserMarket, RetentionMarketFacts>> {
    const entries = await Promise.all(
      markets.map(
        async (market) =>
          [
            market,
            await this.repository.findMarketFacts({
              market,
              weekDates,
              weekEnd,
              listeningSince: new Date(
                now.getTime() - RETENTION_PEERS_WINDOW_MINUTES * 60 * 1000,
              ),
            }),
          ] as const,
      ),
    );

    return new Map(entries);
  }
}

/** 어제부터 거꾸로 이어진 청취 날 수 — 오늘 들었는지는 세지 않는다 */
export function countStreak(
  recentPlayDates: readonly string[],
  today: string,
): number {
  const dates = new Set(recentPlayDates);
  let streak = 0;
  let cursor = shiftServiceDate(today, -1);

  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftServiceDate(cursor, -1);
  }

  return streak;
}

export function toMode(value: string | undefined): RetentionPushMode {
  const normalized = value?.trim();

  return (Object.values(RetentionPushMode) as string[]).includes(
    normalized ?? '',
  )
    ? (normalized as RetentionPushMode)
    : RetentionPushMode.OFF;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 쉼표로 구분한 사용자 id — uuid 형식이 아닌 값은 버린다(오타로 엉뚱한 사람에게 가지 않게, 형식만 본다) */
export function parseTestUserIds(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter((id) => UUID_PATTERN.test(id)),
  );
}

function countByRule(
  plans: RetentionPushPlan[],
): Partial<Record<RetentionRuleKey, number>> {
  const counts: Partial<Record<RetentionRuleKey, number>> = {};

  for (const plan of plans) {
    counts[plan.ruleKey] = (counts[plan.ruleKey] ?? 0) + 1;
  }

  return counts;
}

/**
 * 규칙마다 문구 예시 — dry_run 로그에서 실제로 나갈 문구를 확인하려고 싣는다. 사용자 식별값은 싣지 않는다
 * (듣던 콘텐츠 제목은 콘텐츠 정보라 개인 식별값이 아니다).
 */
export function sampleCopies(
  plans: RetentionPushPlan[],
): Partial<Record<RetentionRuleKey, string[]>> {
  const samples: Partial<Record<RetentionRuleKey, string[]>> = {};

  for (const plan of plans) {
    const list = samples[plan.ruleKey] ?? [];

    if (list.length < RETENTION_DRY_RUN_SAMPLES_PER_RULE) {
      list.push(`${plan.title} / ${plan.body.replace(/\n/g, ' / ')}`);
      samples[plan.ruleKey] = list;
    }
  }

  return samples;
}
