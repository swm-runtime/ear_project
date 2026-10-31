import { Injectable } from '@nestjs/common';

import {
  serviceDateStart,
  shiftServiceDate,
  shiftWeekStart,
  toCurrentWeekStart,
  toServiceDate,
  toServiceDayRange,
} from '@/common/utils/service-date.util';
import {
  DRIP_ARRIVAL_SLOT_TIMES,
  DripArrivalSlot,
  dripArrivalVariantOf,
} from '@/modules/drip/drip-group.policy';
import { dripArrivalLogType } from '@/modules/notification/services/drip-arrival-notification.service';
import {
  MORNING_PUSH_HOLDOUT_LOG_TYPE,
  MORNING_PUSH_LOG_TYPE_PREFIX,
} from '@/modules/retention-push/retention-push.constant';
import { UserMarket } from '@/modules/user/user.enum';

import { COMPLETION_REACHED_RATIO } from '@/modules/library/library.constant';

import {
  COMPLETION_LENGTH_CONTENT_MARKET,
  COMPLETION_LENGTH_MIN_AGE_HOURS,
  COMPLETION_LENGTH_MIN_CONTENTS,
  COMPLETION_LENGTH_SLOPE_STEP_MIN,
  FUNNEL_FIRST_PLAY_HOURS,
  FUNNEL_HABIT_MIN_PLAY_DAYS,
  FUNNEL_HABIT_WINDOW_DAYS,
  FUNNEL_MAX_WEEKS,
  FUNNEL_MIN_WEEKS,
  INSIGHTS_COHORT_DAILY,
  INSIGHTS_COHORT_WEEKLY,
  INSIGHTS_LIVE_ACTIVE_DAYS,
  INSIGHTS_RANK_LIMIT,
  INSIGHTS_RECENT_CONTENT_HOURS,
  INSIGHTS_RETENTION_DAYS,
  INSIGHTS_SUMMARY_MAX_DAYS,
  INSIGHTS_WEEKDAY_LABELS,
  SERIES_EPISODES_MIN_AGE_HOURS,
  SHORT_VARIANT_DROP_10_SEC,
  SHORT_VARIANT_DROP_30_SEC,
  SHORT_VARIANT_DROP_60_SEC,
  SHORT_VARIANT_MIN_AGE_HOURS,
  DRIP_ARRIVAL_TIME_MAX_DAYS,
} from '../admin.constant';
import {
  InsightsCohortCounts,
  InsightsCohortTable,
  InsightsCompletionByLength,
  InsightsDaily,
  InsightsDailyRows,
  InsightsDripArrivalTime,
  InsightsFunnel,
  InsightsHourly,
  InsightsInviteCodeBaseline,
  InsightsInviteCodeCohort,
  InsightsMarketTotals,
  InsightsSeriesEpisodes,
  InsightsShortVariant,
  InsightsSummary,
  InsightsWeekday,
} from '../admin.types';
import { AdminInsightsRepository } from '../repositories/admin-insights.repository';
import { summarizeCompletionByLength } from './admin-insights-completion.calc';
import {
  DripArrivalTimeArmSpec,
  dripArrivalTimeArms,
} from './admin-insights-drip-arrival-time.calc';
import { groupSeriesEpisodes } from './admin-insights-series.calc';
import {
  byCohort,
  byIntroVersion,
  byLengthProfile,
  variantPairs,
} from './admin-insights-short-variant.calc';
import {
  buildFunnelCohort,
  summarizeFunnelSteps,
} from './admin-insights-funnel.calc';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const hhmm = ({ hour, minute }: { hour: number; minute: number }): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** 도착 알림 시각 실험의 네 행 — 순서·발송 시각·참고 여부. 아침 알림은 08:00(KAN-288) · 드립 없는 날만이라 A/B 비교가 아니다 */
const DRIP_ARRIVAL_TIME_ARMS: DripArrivalTimeArmSpec[] = [
  {
    key: 'baseline',
    sendTime: hhmm(DRIP_ARRIVAL_SLOT_TIMES[DripArrivalSlot.H0700]),
    reference: false,
  },
  {
    key: 'a',
    sendTime: hhmm(DRIP_ARRIVAL_SLOT_TIMES[DripArrivalSlot.H0730]),
    reference: false,
  },
  {
    key: 'b',
    sendTime: hhmm(DRIP_ARRIVAL_SLOT_TIMES[DripArrivalSlot.H0800]),
    reference: false,
  },
  {
    key: 'morning',
    sendTime: hhmm(DRIP_ARRIVAL_SLOT_TIMES[DripArrivalSlot.H0800]),
    reference: true,
  },
  // 아침 알림 비교 그룹(2026-10-31) — 받은 쪽(morning)과 견주는 행이다. 도착 알림 A/B 비교에는 들지 않는다
  {
    key: 'morning_holdout',
    sendTime: hhmm(DRIP_ARRIVAL_SLOT_TIMES[DripArrivalSlot.H0800]),
    reference: true,
  },
];

/** `[from, to]`가 걸친 서비스 날짜마다 `[start, end)` — 전환일(25시간)도 `toServiceDayRange`가 맞춘다 */
export function serviceDayRangesBetween(
  from: Date,
  to: Date,
): { start: Date; end: Date }[] {
  const last = toServiceDate(to);
  const ranges: { start: Date; end: Date }[] = [];
  for (
    let label = toServiceDate(from);
    label <= last;
    label = shiftServiceDate(label, 1)
  ) {
    ranges.push(toServiceDayRange(serviceDateStart(label)));
  }
  return ranges;
}

/**
 * 서비스 지표 요약(`admin-api.md` 4.22) — 집계는 Repository 가, 여기서는 창을 정하고 빈 날짜·시간대를 0 으로 채운다.
 * 질의를 **순차**로 부른다: 운영 DB 연결을 한 번에 여럿 잡지 않기 위해서다(탭을 연 사람 1명 = 연결 1개).
 */
@Injectable()
export class AdminInsightsService {
  constructor(private readonly repository: AdminInsightsRepository) {}

  /**
   * `days`는 DTO 가 1~상한으로 검증한다. 창의 시작은 `now - days`. `market`이 있으면 시장 비교(`byMarket`)를 뺀 모든 집계를
   * 그 시장 사용자로 좁힌다(지금 시장 기준 — 2026-10-25)
   */
  /** 프로모션(초대 코드)별 묶음 지표 — 창은 `now - days`(청취 시간만 창을 따른다, 활성·청취자는 최근 7일 고정) */
  async inviteCodeCohorts(
    days: number,
    now: Date,
  ): Promise<{
    since: Date;
    codes: InsightsInviteCodeCohort[];
    baseline: InsightsInviteCodeBaseline;
  }> {
    const since = new Date(now.getTime() - days * DAY_MS);

    return { since, ...(await this.repository.inviteCodeCohorts(since, now)) };
  }

  /**
   * 가입 퍼널(`GET /admin/insights/funnel`, 로그 콘솔 "실험 지표" 탭, 2026-10-28) — 가입한 사람이 어느 단계에서 가장 많이 빠지나.
   * 가입 주(서비스 주 — 월 05:00 KST ~, `service-date.util`)로 `weeks`개(이번 주 포함) 묶고, 끝나지 않은 단계는 null 로 가린 뒤
   * 성숙한 묶음만 합쳐 단계별 전환율과 가장 큰 이탈 단계를 낸다.
   */
  async signupFunnel(
    weeks: number,
    now: Date,
    market: UserMarket | null = null,
  ): Promise<InsightsFunnel> {
    const count = Math.min(Math.max(FUNNEL_MIN_WEEKS, weeks), FUNNEL_MAX_WEEKS);
    const currentWeek = toCurrentWeekStart(now);
    const windows = {
      firstPlayHours: FUNNEL_FIRST_PLAY_HOURS,
      habitDays: FUNNEL_HABIT_WINDOW_DAYS,
    };
    // 최근 묶음 먼저
    const cohortRanges = Array.from({ length: count }, (_, i) => {
      const weekStart = shiftWeekStart(currentWeek, -i);
      return {
        weekStart,
        startAt: serviceDateStart(weekStart),
        endAt: serviceDateStart(shiftWeekStart(weekStart, 1)),
      };
    });
    const funnelCounts = await this.repository.funnelCohorts(
      cohortRanges,
      { ...windows, minPlayDays: FUNNEL_HABIT_MIN_PLAY_DAYS },
      market,
    );
    const liveFrom = kstDateLabel(
      new Date(now.getTime() - INSIGHTS_LIVE_ACTIVE_DAYS * DAY_MS),
    );
    const reliableSince = cohortReliableSince(
      await this.repository.activeDatesFirstRecordedAt(),
      liveFrom,
    );
    const todayKst = kstDateLabel(now);
    const countsByWeek = new Map(funnelCounts.map((c) => [c.weekStart, c]));
    const cohorts = cohortRanges.map(({ weekStart, endAt }) =>
      buildFunnelCohort(
        countsByWeek.get(weekStart) ?? {
          weekStart,
          signups: 0,
          onboardingCompleted: 0,
          firstPlay24h: 0,
          firstPlayEver: 0,
          firstComplete: 0,
          w1Return: 0,
          habit14d: 0,
          paidEver: 0,
        },
        endAt,
        now,
        todayKst,
        reliableSince,
        windows,
      ),
    );

    return {
      market,
      weeks: count,
      generatedAt: now,
      reliableSince,
      cohorts,
      ...summarizeFunnelSteps(cohorts),
    };
  }

  /**
   * 길이별 완청률(`GET /admin/insights/completion-by-length`, 실험 지표 탭, 2026-10-28) — 한국 콘텐츠의 편별 시작·완청 수를 읽어
   * 로지스틱 회귀 추세와 경험적 베이즈 축소값을 붙인다(`admin-insights-completion.calc.ts`).
   */
  async completionByLength(now: Date): Promise<InsightsCompletionByLength> {
    const rows = await this.repository.completionByContent(now, {
      market: COMPLETION_LENGTH_CONTENT_MARKET,
      minAgeHours: COMPLETION_LENGTH_MIN_AGE_HOURS,
      reachedRatio: COMPLETION_REACHED_RATIO,
    });
    return summarizeCompletionByLength(rows, now, {
      slopeStepMin: COMPLETION_LENGTH_SLOPE_STEP_MIN,
      minContents: COMPLETION_LENGTH_MIN_CONTENTS,
    });
  }

  /**
   * 시리즈 편별 완청·이탈(`GET /admin/insights/series-episodes`, KAN-293, 2026-10-29) — 편마다 시작·완청·다음 편 진행 수를 읽어
   * 비율을 붙이고 시리즈로 묶는다(`admin-insights-series.calc.ts`). 시작·완청 정의는 길이별 완청률과 같다.
   */
  async seriesEpisodes(
    now: Date,
    market: UserMarket | null = null,
  ): Promise<InsightsSeriesEpisodes> {
    const rows = await this.repository.seriesEpisodes(now, {
      market,
      minAgeHours: SERIES_EPISODES_MIN_AGE_HOURS,
      reachedRatio: COMPLETION_REACHED_RATIO,
    });
    return { generatedAt: now, market, series: groupSeriesEpisodes(rows) };
  }

  /**
   * 짧은 판·도입부 실험(`GET /admin/insights/short-variant`, KAN-298 · KAN-296, 2026-10-29) — 기존 판 vs 짧은 판 완청률,
   * 기존 도입부 vs 바뀐 도입부의 10초·30초·1분 이탈. `cohortSince`는 호출자가 `ContentCohortService.cohortSince()`로 넘긴다
   * (판정 규칙을 다시 만들지 않는다). 질의는 순차로 부른다.
   */
  async shortVariant(
    now: Date,
    cohortSince: Date | null,
    market: UserMarket | null = null,
  ): Promise<InsightsShortVariant> {
    const rows = await this.repository.shortVariantRows(now, {
      market,
      minAgeHours: SHORT_VARIANT_MIN_AGE_HOURS,
      reachedRatio: COMPLETION_REACHED_RATIO,
      cohortSince,
      dropSec: [
        SHORT_VARIANT_DROP_10_SEC,
        SHORT_VARIANT_DROP_30_SEC,
        SHORT_VARIANT_DROP_60_SEC,
      ],
    });
    const pairs = await this.repository.shortVariantPairs(market);
    return {
      generatedAt: now,
      market,
      cohortSince,
      cohortWindowHours:
        cohortSince === null
          ? null
          : Math.max(0, (now.getTime() - cohortSince.getTime()) / 3_600_000),
      byCohort: byCohort(rows, cohortSince !== null),
      byLengthProfile: byLengthProfile(rows),
      byIntroVersion: byIntroVersion(rows),
      pairs: variantPairs(rows, pairs),
    };
  }

  /**
   * 도착 알림 시각 실험(`GET /admin/insights/drip-arrival-time`, KAN-289, 2026-10-30) — 07:00 기준선 · 07:30(A) · 08:00(B)와
   * 참고 행(아침 알림)의 2시간·당일 재생률. 종류 문자열은 보내는 쪽 정책 함수로 만들고(`dripArrivalLogType` ·
   * `dripArrivalVariantOf`), 당일 경계는 `toServiceDayRange`로 넘긴다(경계 규칙을 다시 만들지 않는다).
   */
  async dripArrivalTime(
    now: Date,
    days: number,
    market: UserMarket | null = null,
  ): Promise<InsightsDripArrivalTime> {
    const clamped = Math.min(Math.max(1, days), DRIP_ARRIVAL_TIME_MAX_DAYS);
    const since = new Date(now.getTime() - clamped * DAY_MS);
    const typeOf = (slot: DripArrivalSlot) =>
      dripArrivalLogType(dripArrivalVariantOf(slot, true));

    const rows = await this.repository.dripArrivalTimeRows(since, {
      market,
      types: {
        baseline: dripArrivalLogType(null),
        a: typeOf(DripArrivalSlot.H0730),
        b: typeOf(DripArrivalSlot.H0800),
        morningPrefix: MORNING_PUSH_LOG_TYPE_PREFIX,
        morningHoldout: MORNING_PUSH_HOLDOUT_LOG_TYPE,
      },
      serviceDays: serviceDayRangesBetween(since, now),
    });
    return {
      generatedAt: now,
      market,
      days: clamped,
      since,
      arms: dripArrivalTimeArms(rows, DRIP_ARRIVAL_TIME_ARMS),
    };
  }

  async summarize(
    days: number,
    now: Date,
    market: UserMarket | null = null,
  ): Promise<InsightsSummary> {
    const clamped = Math.min(Math.max(1, days), INSIGHTS_SUMMARY_MAX_DAYS);
    const since = new Date(now.getTime() - clamped * DAY_MS);

    const users = await this.repository.userTotals(now, market);
    const allTime = await this.repository.listeningTotals(null, market);
    const window = await this.repository.listeningTotals(since, market);
    // 세션이 온전히 남아 있는 첫 날 — 그 앞은 저장 표에 있어야만 접속자를 안다
    const liveFrom = kstDateLabel(
      new Date(now.getTime() - INSIGHTS_LIVE_ACTIVE_DAYS * DAY_MS),
    );
    // 일별 추이는 첫날도 온전한 하루로 센다 — `since`(지금 - days)가 걸친 날의 KST 자정부터. 그러지 않으면 첫 막대가
    // `since` 시각 뒤만 잡혀 코호트 표의 같은 날 가입자보다 적게 보인다(2026-10-22 운영 10-08 가입 39 vs 48)
    const dailySince = kstMidnightOf(since);
    const dailyRows = await this.repository.dailyRows(
      dailySince,
      liveFrom,
      market,
    );
    const firstStored = await this.repository.activeUsersFirstDate();
    const hourly = await this.repository.hourly(since, market);
    const topUsers = await this.repository.topUsers(
      INSIGHTS_RANK_LIMIT,
      market,
    );
    const topContents = await this.repository.topContents(
      INSIGHTS_RANK_LIMIT,
      null,
      'listen_sec',
      market,
    );
    const recentSince = new Date(
      now.getTime() - INSIGHTS_RECENT_CONTENT_HOURS * 60 * 60 * 1000,
    );
    const recentTopContents = await this.repository.topContents(
      INSIGHTS_RANK_LIMIT,
      recentSince,
      'listeners',
      market,
    );
    const withdrawalReasons = await this.repository.withdrawalReasons(market);
    const pushReactions = await this.repository.pushReactions(since, market);
    const retention = await this.repository.retention(
      INSIGHTS_RETENTION_DAYS,
      now,
      market,
    );
    const topicSupply = await this.repository.topicSupply(since, now, market);
    const byMarket = await this.repository.marketTotals(since, now);
    // 나라별은 글로벌 탭에서만 — 국내는 거의 전부 KR 이고, 통합은 시장 비교가 맨 위에 있다
    const byRegion =
      market === UserMarket.GLOBAL
        ? await this.repository.regionTotals(since, now, market)
        : [];

    const today = kstDateLabel(now);
    const activeUsersSince =
      firstStored !== null && firstStored < liveFrom ? firstStored : liveFrom;
    const cohortSince = cohortReliableSince(
      await this.repository.activeDatesFirstRecordedAt(),
      liveFrom,
    );
    // 코호트 표와 같은 원천·같은 신뢰 경계 — 코호트 표 D1·D7 칸의 전 기간 가중 평균이 된다
    const boundedRetention = await this.repository.boundedRetention(
      INSIGHTS_RETENTION_DAYS,
      today,
      cohortSince,
      market,
    );
    const dailyStarts = cohortStarts(today, INSIGHTS_COHORT_DAILY);
    const weeklyStarts = cohortStarts(today, INSIGHTS_COHORT_WEEKLY);
    const dailyCohorts = await this.repository.cohortRetention(
      dailyStarts[dailyStarts.length - 1],
      today,
      INSIGHTS_COHORT_DAILY.span,
      INSIGHTS_COHORT_DAILY.offsets,
      market,
    );
    const weeklyCohorts = await this.repository.cohortRetention(
      weeklyStarts[weeklyStarts.length - 1],
      addDays(today, 1),
      INSIGHTS_COHORT_WEEKLY.span,
      INSIGHTS_COHORT_WEEKLY.offsets,
      market,
    );

    const daily = fillDailySeries(dailySince, now, dailyRows, liveFrom);

    return {
      market,
      since,
      generatedAt: now,
      users,
      listening: { allTime, window },
      daily,
      weekday: summarizeWeekdays(daily, dailySince, now),
      activeUsersSince,
      hourly: fillHourly(hourly),
      topUsers,
      topContents,
      recentTopContents,
      recentSince,
      withdrawalReasons,
      pushReactions,
      retention,
      boundedRetention,
      retentionCohorts: {
        daily: buildCohortTable(
          dailyCohorts,
          dailyStarts,
          INSIGHTS_COHORT_DAILY,
          today,
          cohortSince,
        ),
        weekly: buildCohortTable(
          weeklyCohorts,
          weeklyStarts,
          INSIGHTS_COHORT_WEEKLY,
          today,
          cohortSince,
        ),
      },
      topicSupply,
      byMarket: fillMarkets(byMarket),
      byRegion,
    };
  }
}

/** `at`이 속한 KST 달력일의 자정(00:00 KST) */
export function kstMidnightOf(at: Date): Date {
  return new Date(`${kstDateLabel(at)}T00:00:00+09:00`);
}

/** `YYYY-MM-DD` KST 달력일 라벨 — Repository 의 `to_char(... at time zone 'Asia/Seoul')`와 같은 값이어야 한다 */
export function kstDateLabel(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * `since`의 KST 날짜부터 `now`의 KST 날짜까지 하루씩 — 기록이 없는 날은 0 으로 둔다. 그래프가 빈 날을 건너뛰면
 * 막대 간격이 날짜가 아니라 "기록이 있던 날"이 되어 추이를 잘못 읽는다.
 */
export function fillDailySeries(
  since: Date,
  now: Date,
  rows: InsightsDailyRows,
  liveFrom: string,
): InsightsDaily[] {
  const signups = new Map(rows.signups.map((r) => [r.date, r.count]));
  const stored = new Map(rows.activeUsersStored.map((r) => [r.date, r.count]));
  const live = new Map(rows.activeUsersLive.map((r) => [r.date, r.count]));
  const withdrawals = new Map(rows.withdrawals.map((r) => [r.date, r.count]));
  const plays = new Map(rows.plays.map((r) => [r.date, r]));
  const completes = new Map(rows.completes.map((r) => [r.date, r.count]));

  const series: InsightsDaily[] = [];
  const last = kstDateLabel(now);
  // KST 자정 기준으로 하루씩 전진한다 — 라벨만 쓰므로 DST 같은 건 없다(KST 는 고정 +9)
  for (let cursor = since; ; cursor = new Date(cursor.getTime() + DAY_MS)) {
    const date = kstDateLabel(cursor);
    if (date > last) break;
    const play = plays.get(date);
    series.push({
      date,
      signups: signups.get(date) ?? 0,
      withdrawals: withdrawals.get(date) ?? 0,
      plays: play?.plays ?? 0,
      listeners: play?.listeners ?? 0,
      listenSec: play?.listenSec ?? 0,
      completes: completes.get(date) ?? 0,
      activeUsers: pickActiveUsers(date, last, liveFrom, stored, live),
    });
    if (date === last) break;
  }
  return series;
}

/**
 * 그날 접속자를 어디서 읽을지 — ① 오늘은 아직 저장되지 않았으니 세션에서 바로(그래프가 지금 값이게) ② 지난날은 저장 표
 * (탈퇴로 줄지 않는다) ③ 표에 없는 날(배치 전·놓친 날)은 세션이 온전히 남은 범위(`liveFrom` 이후)면 바로 센다 ④ 그 앞은 원천이
 * 지워져 모른다 — 0 이 아니라 `null`로 둬 "접속자 0명"과 구분한다.
 */
export function pickActiveUsers(
  date: string,
  today: string,
  liveFrom: string,
  stored: ReadonlyMap<string, number>,
  live: ReadonlyMap<string, number>,
): number | null {
  if (date === today) return live.get(date) ?? 0;
  const fromTable = stored.get(date);
  if (fromTable !== undefined) return fromTable;
  if (date >= liveFrom) return live.get(date) ?? 0;
  return null;
}

/**
 * 요일별 평균 — 월~일 7칸(창 안에 없는 요일도 0일 · null 로 싣는다). **온전한 하루만** 센다: 오늘은 끝나지 않았고, 첫날(`since`가
 * 걸친 날)은 청취가 그 시각 뒤만 잡혀 있다(`since`가 KST 자정이면 첫날도 온전하다). 평균은 그 요일의 실제 날짜 수로 나눈다 —
 * 14일 창이라도 요일마다 날 수가 다를 수 있다. 접속자 평균은 접속자를 아는 날(`activeUsers !== null`)만으로 나눈다.
 */
export function summarizeWeekdays(
  daily: InsightsDaily[],
  since: Date,
  now: Date,
): InsightsWeekday[] {
  const today = kstDateLabel(now);
  const firstDay = kstDateLabel(since);
  const sinceIsMidnight = (since.getTime() + KST_OFFSET_MS) % DAY_MS === 0;
  const complete = daily.filter(
    (d) => d.date !== today && (d.date !== firstDay || sinceIsMidnight),
  );

  return INSIGHTS_WEEKDAY_LABELS.map((label, i) => {
    const weekday = i + 1;
    const rows = complete.filter((d) => isoWeekday(d.date) === weekday);
    const known = rows.filter(
      (d): d is InsightsDaily & { activeUsers: number } =>
        d.activeUsers !== null,
    );
    return {
      weekday,
      label,
      days: rows.length,
      activeDays: known.length,
      avgActiveUsers: average(known.map((d) => d.activeUsers)),
      avgListeners: average(rows.map((d) => d.listeners)),
    };
  });
}

/** `YYYY-MM-DD` → ISO 요일(1 = 월 … 7 = 일). 라벨이 이미 KST 날짜라 UTC 로 읽어도 요일이 같다 */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

const average = (values: number[]): number | null =>
  values.length > 0
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : null;

/** `YYYY-MM-DD` 달력일에 `n`일을 더한다 — 라벨 연산이라 시간대가 없다 */
export function addDays(date: string, n: number): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * 코호트의 접속 기록을 믿을 수 있는 첫 날 — 사람별 접속일 표가 백필된 날(KST) - 29일(그때 세션이 온전히 남아 있던 범위,
 * `INSIGHTS_LIVE_ACTIVE_DAYS`와 같은 경계). 표가 비었으면 세션으로 바로 셀 수 있는 첫 날(`liveFrom`)이다 — 질의가 남은 세션도
 * 함께 읽으므로 그 날부터는 표 없이도 온전하다(같은 이유로 결과가 `liveFrom`보다 늦지 않게 자른다).
 * 일별 접속자의 `activeUsersSince`(다른 표·다른 마이그레이션)를 쓰지 않는다 — 두 마이그레이션이 다른 날 돌면 어긋난다.
 */
export function cohortReliableSince(
  firstRecordedAt: Date | null,
  liveFrom: string,
): string {
  if (firstRecordedAt === null) return liveFrom;
  const backfilled = addDays(
    kstDateLabel(firstRecordedAt),
    -INSIGHTS_LIVE_ACTIVE_DAYS,
  );
  return backfilled < liveFrom ? backfilled : liveFrom;
}

/**
 * 코호트 묶음 시작일 — 최근 묶음 먼저 `count`개. 일별(`span` 1)은 어제부터(오늘 가입자는 D1 도 아직 없다), 주별(`span` 7)은
 * 이번 주 월요일부터(이번 주 가입자도 묶음 크기는 보인다).
 */
export function cohortStarts(
  today: string,
  { count, span }: { count: number; span: number },
): string[] {
  const latest =
    span === 7 ? addDays(today, 1 - isoWeekday(today)) : addDays(today, -1);
  return Array.from({ length: count }, (_, i) => addDays(latest, -i * span));
}

/**
 * 코호트 표 — 묶음마다 가입자 수와 `offsets` 구간별 칸. 빈 묶음(그 날·주 가입 0명)도 행을 둔다.
 *
 * - 칸이 `null`: 그 구간이 **묶음의 마지막 가입자 기준으로 아직 끝나지 않았다**(끝나는 날이 오늘 이후). 일부만 끝난 묶음의
 *   값을 섞으면 최근 묶음이 낮아 보인다 — 끝난 칸만 숫자로 싣는다.
 * - `partial`: 구간이 `reliableSince`(접속 기록을 믿을 수 있는 첫 날) 앞에서 시작한다 — 그 앞은 재생만 잡힌다.
 */
export function buildCohortTable(
  counts: InsightsCohortCounts,
  starts: string[],
  { span, offsets }: { span: number; offsets: readonly number[] },
  today: string,
  reliableSince: string,
): InsightsCohortTable {
  const sizes = new Map(counts.sizes.map((r) => [r.start, r.users]));
  const hits = new Map(
    counts.hits.map((r) => [`${r.start}|${r.offset}`, r.returned]),
  );
  return {
    span,
    offsets: [...offsets],
    reliableSince,
    rows: starts.map((start) => {
      const lastMember = addDays(start, span - 1);
      return {
        start,
        users: sizes.get(start) ?? 0,
        cells: offsets.map((offset) =>
          addDays(lastMember, (offset + 1) * span) <= today
            ? {
                returned: hits.get(`${start}|${offset}`) ?? 0,
                partial: addDays(start, offset * span) < reliableSince,
              }
            : null,
        ),
      };
    }),
  };
}

/** 시장마다 한 칸 — 계정이 없는 시장(출시 전 GLOBAL)도 0 으로 그려야 "0명"과 "집계 누락"이 구분된다 */
export function fillMarkets(
  rows: InsightsMarketTotals[],
): InsightsMarketTotals[] {
  const byMarket = new Map(rows.map((r) => [r.market, r]));
  return Object.values(UserMarket).map(
    (market) =>
      byMarket.get(market) ?? {
        market,
        users: 0,
        signupsInWindow: 0,
        onboardingCompleted: 0,
        active7d: 0,
        listeners7d: 0,
        listenSec: 0,
        plays: 0,
        paidActive: 0,
      },
  );
}

/** 0~23시 전부 — 재생이 없던 시간대도 0 으로 그린다 */
export function fillHourly(rows: InsightsHourly[]): InsightsHourly[] {
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    plays: byHour.get(hour)?.plays ?? 0,
    listenSec: byHour.get(hour)?.listenSec ?? 0,
  }));
}
