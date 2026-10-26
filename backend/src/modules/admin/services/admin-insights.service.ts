import { Injectable } from '@nestjs/common';

import { UserMarket } from '@/modules/user/user.enum';

import {
  INSIGHTS_COHORT_DAILY,
  INSIGHTS_COHORT_WEEKLY,
  INSIGHTS_LIVE_ACTIVE_DAYS,
  INSIGHTS_RANK_LIMIT,
  INSIGHTS_RECENT_CONTENT_HOURS,
  INSIGHTS_RETENTION_DAYS,
  INSIGHTS_SUMMARY_MAX_DAYS,
  INSIGHTS_WEEKDAY_LABELS,
} from '../admin.constant';
import {
  InsightsCohortCounts,
  InsightsCohortTable,
  InsightsDaily,
  InsightsDailyRows,
  InsightsHourly,
  InsightsMarketTotals,
  InsightsSummary,
  InsightsWeekday,
} from '../admin.types';
import { AdminInsightsRepository } from '../repositories/admin-insights.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

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
    const retention = await this.repository.retention(
      INSIGHTS_RETENTION_DAYS,
      now,
      market,
    );
    const topicSupply = await this.repository.topicSupply(since, now, market);
    const byMarket = await this.repository.marketTotals(since, now);

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
