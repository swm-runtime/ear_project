import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import {
  toCurrentWeekStart,
  toServiceDayRange,
} from '@/common/utils/service-date.util';
import {
  DEFAULT_DRIP_GROUP,
  DRIP_GROUP_SCHEDULES,
  dripGroupOf,
} from '@/modules/drip/drip-group.policy';
import { DripGroup } from '@/modules/drip/drip.enum';
import { NotificationType } from '@/modules/notification/notification.enum';
import { TargetedPushService } from '@/modules/notification/services/targeted-push.service';
import { messageLanguageOf } from '@/modules/user/policies/market.policy';

import {
  isWithinAdHours,
  morningListenedSince,
  morningLogType,
  MorningPushPlan,
  MorningSkipReason,
  planMorningPush,
} from './morning-push.policy';
import {
  MORNING_PUSH_DAILY_WINDOW_HOURS,
  MORNING_PUSH_LOG_TYPE_PREFIX,
  MORNING_PUSH_TTL_SEC,
  MORNING_PUSH_UNPLAYED_RECENT_DAYS,
} from './retention-push.constant';
import { RetentionPushMode } from './retention-push.enum';
import {
  MorningFactRow,
  RetentionPushRepository,
} from './retention-push.repository';
import { parseTestUserIds, toMode } from './retention-push.service';

const HOUR_MS = 60 * 60 * 1000;
/** 사용자별 사실 조회 한 번의 크기 */
const FACTS_CHUNK_SIZE = 1000;

export interface MorningPushSummary {
  audience: number;
  planned: number;
  skipped: Partial<Record<MorningSkipReason, number>>;
  sent: number;
  failed: number;
}

/**
 * 아침 알림(KAN-288 — 단기 실험 ③, 2026-10-29). **드립 도착 알림 크론의 08:00 실행 안에서** 부른다
 * (`DripBatchOrchestrator.notifyTodayArrivals`) — 오늘 배치가 누구에게 적립했는지 그 자리에서 알아, 드립이 있는 날은 도착 알림만,
 * 없는 날(미완료 5편 이상으로 건너뜀·후보 고갈 등)은 이 알림만 가게 한다(하루 1건).
 *
 * 광고성(재방문 유도)이라 저녁 리텐션 알림과 같은 대상(마케팅 수신 동의 · 온보딩 완료 · 보낼 기기)·같은 광고 표기를 쓴다.
 * 야간 금지(21~08)를 사용자 현지 시각으로 지키고, 그래서 07:30이 아니라 **08:00에만** 보낸다.
 *
 * 서버 스위치는 저녁과 따로 둔다 — `RETENTION_MORNING_PUSH_MODE` = `off`(기본) · `dry_run` · `on`. 저녁(`RETENTION_PUSH_MODE`)이
 * 이미 켜진 환경에서 이 코드가 배포되자마자 아침 알림이 나가지 않게, 그리고 두 실험을 따로 켜고 끌 수 있게 한다.
 * `dry_run`은 대상·문구까지 정하고 시험 대상(`RETENTION_PUSH_TEST_USER_IDS`, 저녁과 공유)에게만 실제로 보낸다 — 시험 대상이
 * 없으면 아무에게도 보내지 않고 건수만 로그에 남긴다.
 */
@Injectable()
export class MorningPushService {
  private readonly logger = new Logger(MorningPushService.name);

  constructor(
    private readonly repository: RetentionPushRepository,
    private readonly targetedPushService: TargetedPushService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** 부를 때마다 읽는다 — 아침 크론이 하루 한 번이라 비용이 없고, 시험(e2e)이 앱을 다시 띄우지 않고 바꿀 수 있다 */
  get mode(): RetentionPushMode {
    return toMode(
      this.configService.get('RETENTION_MORNING_PUSH_MODE', { infer: true }),
    );
  }

  /** 스위치가 켜져 있고(dry_run 포함) 그 그룹이 돌아야 하는가 — 그룹 규칙은 드립·저녁과 같다 */
  isGroupActive(group: DripGroup): boolean {
    return (
      this.mode !== RetentionPushMode.OFF &&
      (this.timezoneGroupsEnabled() || group === DEFAULT_DRIP_GROUP)
    );
  }

  /** `placedUserIds` — 오늘 그 그룹 편성 배치가 적립한 사용자(드립이 있는 날). 이들은 도착 알림 몫이다 */
  async run(
    group: DripGroup,
    now: Date,
    placedUserIds: ReadonlySet<string>,
  ): Promise<MorningPushSummary> {
    const mode = this.mode;
    const { items, audience, skipped } = await this.planGroup(
      group,
      now,
      placedUserIds,
    );
    const testUserIds = parseTestUserIds(
      this.configService.get('RETENTION_PUSH_TEST_USER_IDS', { infer: true }),
    );
    const sending =
      mode === RetentionPushMode.ON
        ? items
        : mode === RetentionPushMode.DRY_RUN
          ? items.filter((plan) => testUserIds.has(plan.userId))
          : [];
    const summary: MorningPushSummary = {
      audience,
      planned: items.length,
      skipped,
      sent: 0,
      failed: 0,
    };

    if (sending.length > 0) {
      const result = await this.targetedPushService.send(
        sending.map((plan) => ({
          userId: plan.userId,
          type: morningLogType(plan.variant),
          title: plan.title,
          body: plan.body,
          deepLink: plan.deepLink,
          ttl: MORNING_PUSH_TTL_SEC,
        })),
        now,
      );
      summary.sent = result.sent;
      summary.failed = result.failed;
    }

    this.logger.log('retention morning push processed', {
      group,
      mode,
      audience: summary.audience,
      planned: summary.planned,
      skipped: summary.skipped,
      by_variant: countByVariant(items),
      sent: summary.sent,
      failed: summary.failed,
      ...(mode === RetentionPushMode.DRY_RUN
        ? {
            // 사용자 식별값은 싣지 않는다 — 문구 예시(콘텐츠 제목은 콘텐츠 정보)와 시험 대상 수만
            samples: sampleMorningCopies(items),
            test_users: testUserIds.size,
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
    placedUserIds: ReadonlySet<string>,
  ): Promise<{
    audience: number;
    items: MorningPushPlan[];
    skipped: Partial<Record<MorningSkipReason, number>>;
  }> {
    const timezoneGroupsEnabled = this.timezoneGroupsEnabled();
    const audience = (await this.repository.findAudience()).filter(
      (user) =>
        (timezoneGroupsEnabled
          ? dripGroupOf(user, now)
          : DEFAULT_DRIP_GROUP) === group,
    );
    const deliverable = await this.targetedPushService.filterDeliverableUserIds(
      audience.map((user) => user.userId),
    );
    const targets = audience.filter((user) => deliverable.has(user.userId));
    const skipped: Partial<Record<MorningSkipReason, number>> = {};

    if (targets.length === 0) {
      return { audience: 0, items: [], skipped };
    }

    const userIds = targets.map((user) => user.userId);
    const [arrivalSent, morningSent, facts] = await Promise.all([
      this.sentUserIds(
        userIds,
        NotificationType.DRIP_ARRIVAL,
        toServiceDayRange(now).start,
      ),
      this.sentUserIds(
        userIds,
        MORNING_PUSH_LOG_TYPE_PREFIX,
        new Date(now.getTime() - MORNING_PUSH_DAILY_WINDOW_HOURS * HOUR_MS),
      ),
      this.findFacts(userIds, now, DRIP_GROUP_SCHEDULES[group].timeZone),
    ]);
    const weekStart = toCurrentWeekStart(now);
    const groupTimeZone = DRIP_GROUP_SCHEDULES[group].timeZone;
    const items: MorningPushPlan[] = [];

    for (const user of targets) {
      const fact = facts.get(user.userId);

      if (!fact) {
        continue;
      }

      const result = planMorningPush(
        {
          userId: user.userId,
          language: messageLanguageOf(user.market),
          unplayedCount: fact.unplayedCount,
          single: fact.single,
          listenedRecently: fact.listenedRecently,
          placedToday: placedUserIds.has(user.userId),
          arrivalSentToday: arrivalSent.has(user.userId),
          morningSentRecently: morningSent.has(user.userId),
          withinAdHours: isWithinAdHours(user.timezone, groupTimeZone, now),
        },
        weekStart,
      );

      if (typeof result === 'string') {
        skipped[result] = (skipped[result] ?? 0) + 1;
      } else {
        items.push(result);
      }
    }

    return { audience: targets.length, items, skipped };
  }

  private timezoneGroupsEnabled(): boolean {
    return (
      this.configService
        .get('DRIP_TIMEZONE_GROUPS_ENABLED', { infer: true })
        ?.trim() === 'true'
    );
  }

  /** `since` 이후 종류가 `typePrefix`로 시작하는 알림을 보낸(`sent`) 사용자 */
  private async sentUserIds(
    userIds: string[],
    typePrefix: string,
    since: Date,
  ): Promise<Set<string>> {
    const rows = await this.targetedPushService.findSentHistory(
      userIds,
      typePrefix,
      since,
    );

    return new Set(rows.map((row) => row.userId));
  }

  private async findFacts(
    userIds: string[],
    now: Date,
    groupTimeZone: string,
  ): Promise<Map<string, MorningFactRow>> {
    const facts = new Map<string, MorningFactRow>();

    for (let i = 0; i < userIds.length; i += FACTS_CHUNK_SIZE) {
      const rows = await this.repository.findMorningFacts({
        userIds: userIds.slice(i, i + FACTS_CHUNK_SIZE),
        addedSince: new Date(
          now.getTime() - MORNING_PUSH_UNPLAYED_RECENT_DAYS * 24 * HOUR_MS,
        ),
        listenedSince: morningListenedSince(now, groupTimeZone),
      });

      for (const row of rows) {
        facts.set(row.userId, row);
      }
    }

    return facts;
  }
}

function countByVariant(plans: MorningPushPlan[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const plan of plans) {
    const type = morningLogType(plan.variant);
    counts[type] = (counts[type] ?? 0) + 1;
  }

  return counts;
}

/** 변형마다 문구 예시 1개 — 1편(콘텐츠로)과 여러 편(라이브러리로)을 나눠 싣는다 */
export function sampleMorningCopies(
  plans: MorningPushPlan[],
): Record<string, string> {
  const samples: Record<string, string> = {};

  for (const plan of plans) {
    const key = `${morningLogType(plan.variant)}:${plan.deepLink.startsWith('ear://contents/') ? 'single' : 'multiple'}`;

    samples[key] ??= `${plan.title} / ${plan.body.replace(/\n/g, ' / ')}`;
  }

  return samples;
}
