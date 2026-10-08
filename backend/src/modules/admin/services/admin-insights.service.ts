import { Injectable } from '@nestjs/common';

import {
  INSIGHTS_RANK_LIMIT,
  INSIGHTS_RETENTION_DAYS,
  INSIGHTS_SUMMARY_MAX_DAYS,
} from '../admin.constant';
import {
  InsightsDaily,
  InsightsDailyRows,
  InsightsHourly,
  InsightsSummary,
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

  /** `days`는 DTO 가 1~상한으로 검증한다. 창의 시작은 `now - days` */
  async summarize(days: number, now: Date): Promise<InsightsSummary> {
    const clamped = Math.min(Math.max(1, days), INSIGHTS_SUMMARY_MAX_DAYS);
    const since = new Date(now.getTime() - clamped * DAY_MS);

    const users = await this.repository.userTotals(now);
    const allTime = await this.repository.listeningTotals(null);
    const window = await this.repository.listeningTotals(since);
    const dailyRows = await this.repository.dailyRows(since);
    const hourly = await this.repository.hourly(since);
    const topUsers = await this.repository.topUsers(INSIGHTS_RANK_LIMIT);
    const topContents = await this.repository.topContents(INSIGHTS_RANK_LIMIT);
    const withdrawalReasons = await this.repository.withdrawalReasons();
    const retention = await this.repository.retention(
      INSIGHTS_RETENTION_DAYS,
      now,
    );

    return {
      since,
      generatedAt: now,
      users,
      listening: { allTime, window },
      daily: fillDailySeries(since, now, dailyRows),
      hourly: fillHourly(hourly),
      topUsers,
      topContents,
      withdrawalReasons,
      retention,
    };
  }
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
): InsightsDaily[] {
  const signups = new Map(rows.signups.map((r) => [r.date, r.count]));
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
    });
    if (date === last) break;
  }
  return series;
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
