import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { UserMarket } from '@/modules/user/user.enum';

import {
  InsightsDailyRows,
  InsightsHourly,
  InsightsListeningTotals,
  InsightsMarketTotals,
  InsightsRetention,
  InsightsTopContent,
  InsightsTopicSupply,
  InsightsTopUser,
  InsightsUserTotals,
  InsightsWithdrawalReason,
} from '../admin.types';

/** 합계는 `::float8`로 받는다 — pg 드라이버가 `bigint`(sum 의 기본 타입)는 문자열로 돌려준다 */
interface UserTotalsRow {
  current: number;
  withdrawals: number;
  onboarding_completed: number;
  trial_active: number;
  tier_light: number;
  tier_daily: number;
  tier_pro: number;
  tier_daily_event: number;
  tier_pro_event: number;
  paid_active: number;
  activated: number;
  active_1d: number;
  active_7d: number;
  active_30d: number;
  listeners_1d: number;
  listeners_7d: number;
  listeners_30d: number;
}
interface ProviderRow {
  provider: string;
  count: number;
}
interface ListeningRow {
  listen_sec: number;
  plays: number;
  listeners: number;
}
interface CountRow {
  count: number;
}
interface DateCountRow {
  date: string;
  count: number;
}
interface DatePlaysRow {
  date: string;
  plays: number;
  listeners: number;
  listen_sec: number;
}
interface HourlyRow {
  hour: number;
  plays: number;
  listen_sec: number;
}
interface TopUserRow {
  user_id: string;
  listen_sec: number;
  plays: number;
  completes: number;
  tier: string;
  signed_up_at: Date;
  last_played_at: Date;
}
interface TopContentRow {
  content_id: string;
  title: string;
  duration_sec: number;
  listen_sec: number;
  plays: number;
  listeners: number;
  completes: number;
  saves: number;
}
interface ReasonRow {
  reason_code: string | null;
  count: number;
}
interface TopicSupplyRow {
  topic_id: string;
  name: string;
  is_visible: boolean;
  published: number;
  published_in_window: number;
  interested_users: number;
  median_remaining: number;
  exhausted_users: number;
  low_users: number;
}

interface MarketTotalsRow {
  market: UserMarket;
  users: number;
  signups_in_window: number;
  onboarding_completed: number;
  active_7d: number;
  listeners_7d: number;
  listen_sec: number;
  plays: number;
  paid_active: number;
}

interface RetentionRow {
  day: number;
  cohort_size: number;
  returned: number;
}

/** KST 달력일 라벨 — 검색 로그 요약(`search-query-log.repository.ts`)과 같은 기준 */
const kstDateExpr = (column: string): string =>
  `to_char((${column} at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')`;

/**
 * 서비스 지표 요약(`admin-api.md` 4.22)의 집계 — 로그 콘솔 "서비스 지표" 탭이 읽는다.
 *
 * Raw SQL 이다(architecture.md 3.4 — Repository 안에서만, 결과를 타입으로 정의해 반환). 여러 모듈의 테이블을
 * 한 화면으로 모으는 조회라 데이터 소유 모듈이 없고, 이미 셋 이상을 조합하는 admin 모듈에 둔다(`DailyMetricsDbService`
 * 와 같은 자리). **읽기만 한다** — 어떤 질의도 행을 바꾸지 않는다.
 *
 * - 재생·청취 시간의 원천은 `play_records`(행 단위·즉시 반영)다. `content_stats`는 경계 직후(05:30) 배치가 모으는 집계라 하루
 *   뒤처지고, 대신 탈퇴자의 청취가 남는다 — 두 숫자는 다를 수 있고 이 화면은 전자를 쓴다.
 * - **단, 전 기간 누적 재생 수·청취 시간·완청 수는 `play_daily_totals`를 읽는다**(2026-10-17). 완청 신호는 180일 보존 배치로도 지워진다. 재생 기록과 같은 트랜잭션에서 더해지고
 *   탈퇴해도 지우지 않아 **줄지 않는다** — `play_records` 합계는 탈퇴하면 줄었다(운영 100시간 → 96시간).
 * - 탈퇴자는 `users`에서 지워진다(domain.md 12.3). 그래서 "가입한 적 있는 사람"은 `users` + `withdrawal_logs`이고,
 *   탈퇴자의 재생·라이브러리 행도 함께 지워져 창 안 청취·순위·일별 추이·리텐션은 **현재 계정 기준**이다(생존 편향 — 화면 각주가
 *   적는다). 전 기간 재생 수·청취 시간·완청 수만 예외다(아래).
 * - 질의는 호출부가 **순차**로 부른다. 탭을 연 사람 한 명이 운영 DB 연결을 열 개씩 동시에 잡지 않게 — 테이블이 작아
 *   전부 합쳐도 수십 ms 다.
 * - 개인 식별 정보는 어떤 행에도 넣지 않는다 — 사용자 순위는 `user_id`·티어·가입일뿐이다.
 */
/**
 * 그 티어 중 **초대 코드 이벤트로** 그 티어인 계정 수(domain.md 8.6, 2026-10-10) — 지금 지급 중인 요금제가 그 티어이고,
 * 같은 티어 이상의 살아 있는 구독이 없는 계정. 이벤트와 결제가 겹친 계정(같은 티어를 결제 중)은 결제로 센다.
 * 쿼리 상수 조각이라 값 바인딩 없이 끼워 넣는다(인자는 이 파일의 리터럴뿐이다).
 */
const EVENT_TIER_COUNT = (
  tier: 'daily' | 'pro',
): string => `(select count(*) from users u
           where u.tier = '${tier}'
             and exists (select 1 from invite_code_redemptions r
                         where r.user_id = u.id and r.tier = '${tier}' and r.starts_at <= $1 and r.ends_at > $1)
             and not exists (select 1 from subscriptions s
                         where s.user_id = u.id and s.status in ('active', 'grace', 'cancelled') and s.expires_at > $1
                           and s.tier in (${tier === 'daily' ? "'daily', 'pro'" : "'pro'"})))::int`;

@Injectable()
export class AdminInsightsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async userTotals(now: Date): Promise<InsightsUserTotals> {
    const [row] = await this.dataSource.query<UserTotalsRow[]>(
      `select
         (select count(*) from users)::int as current,
         (select count(*) from withdrawal_logs)::int as withdrawals,
         (select count(*) from users where onboarding_completed)::int as onboarding_completed,
         (select count(*) from users where trial_ends_at > $1)::int as trial_active,
         (select count(*) from users where tier = 'light')::int as tier_light,
         (select count(*) from users where tier = 'daily')::int as tier_daily,
         (select count(*) from users where tier = 'pro')::int as tier_pro,
         ${EVENT_TIER_COUNT('daily')} as tier_daily_event,
         ${EVENT_TIER_COUNT('pro')} as tier_pro_event,
         (select count(distinct user_id) from subscriptions
           where status in ('active', 'grace', 'cancelled') and environment = 'production' and expires_at > $1)::int as paid_active,
         (select count(distinct user_id) from play_records)::int as activated,
         (select count(distinct user_id) from sessions where issued_at >= $1::timestamptz - interval '1 day')::int as active_1d,
         (select count(distinct user_id) from sessions where issued_at >= $1::timestamptz - interval '7 days')::int as active_7d,
         (select count(distinct user_id) from sessions where issued_at >= $1::timestamptz - interval '30 days')::int as active_30d,
         (select count(distinct user_id) from play_records where played_at >= $1::timestamptz - interval '1 day')::int as listeners_1d,
         (select count(distinct user_id) from play_records where played_at >= $1::timestamptz - interval '7 days')::int as listeners_7d,
         (select count(distinct user_id) from play_records where played_at >= $1::timestamptz - interval '30 days')::int as listeners_30d`,
      [now],
    );
    const byProvider = await this.dataSource.query<ProviderRow[]>(
      `select provider, count(*)::int as count from users group by provider order by count desc, provider`,
    );

    return {
      totalSignups: row.current + row.withdrawals,
      current: row.current,
      withdrawals: row.withdrawals,
      onboardingCompleted: row.onboarding_completed,
      trialActive: row.trial_active,
      tiers: {
        light: row.tier_light,
        daily: row.tier_daily,
        pro: row.tier_pro,
      },
      tierEvents: {
        daily: row.tier_daily_event,
        pro: row.tier_pro_event,
      },
      paidActive: row.paid_active,
      activated: row.activated,
      active1d: row.active_1d,
      active7d: row.active_7d,
      active30d: row.active_30d,
      listeners1d: row.listeners_1d,
      listeners7d: row.listeners_7d,
      listeners30d: row.listeners_30d,
      byProvider: byProvider.map((p) => ({
        provider: p.provider,
        count: p.count,
      })),
    };
  }

  /**
   * 시장별 가입·활성·청취·결제(`global-api.md` 4.10). 각 값은 `userTotals`·`listeningTotals`의 같은 이름 지표를 시장으로
   * 나눈 것이다 — 사용자 행을 한 번 훑으며 사용자마다 존재 여부만 본다. 계정이 없는 시장은 행이 없다(Service 가 0 으로 채운다).
   */
  async marketTotals(since: Date, now: Date): Promise<InsightsMarketTotals[]> {
    const rows = await this.dataSource.query<MarketTotalsRow[]>(
      `select u.market,
              count(*)::int as users,
              count(*) filter (where u.created_at >= $2)::int as signups_in_window,
              count(*) filter (where u.onboarding_completed)::int as onboarding_completed,
              count(*) filter (where exists (
                select 1 from sessions s
                 where s.user_id = u.id and s.issued_at >= $1::timestamptz - interval '7 days'))::int as active_7d,
              count(*) filter (where exists (
                select 1 from play_records p
                 where p.user_id = u.id and p.played_at >= $1::timestamptz - interval '7 days'))::int as listeners_7d,
              coalesce(sum(w.listen_sec), 0)::float8 as listen_sec,
              coalesce(sum(w.plays), 0)::int as plays,
              count(*) filter (where exists (
                select 1 from subscriptions s
                 where s.user_id = u.id and s.status in ('active', 'grace', 'cancelled')
                   and s.environment = 'production' and s.expires_at > $1))::int as paid_active
         from users u
         left join lateral (
           select sum(p.listened_sec) as listen_sec, count(*) as plays
             from play_records p
            where p.user_id = u.id and p.played_at >= $2
         ) w on true
        group by u.market`,
      [now, since],
    );

    return rows.map((r) => ({
      market: r.market,
      users: r.users,
      signupsInWindow: r.signups_in_window,
      onboardingCompleted: r.onboarding_completed,
      active7d: r.active_7d,
      listeners7d: r.listeners_7d,
      listenSec: r.listen_sec,
      plays: r.plays,
      paidActive: r.paid_active,
    }));
  }

  /**
   * `since`가 null 이면 전 기간. 전 기간의 재생 수·청취 시간·완청 수는 `play_daily_totals`(줄지 않는 누적)이고, 청취자 수·담기는
   * 사람 단위 원천이라 현재 계정 기준이다(탈퇴하면 빠진다)
   */
  async listeningTotals(since: Date | null): Promise<InsightsListeningTotals> {
    const [play] = await this.dataSource.query<ListeningRow[]>(
      `select coalesce(sum(listened_sec), 0)::float8 as listen_sec,
              count(*)::int as plays,
              count(distinct user_id)::int as listeners
         from play_records
        where $1::timestamptz is null or played_at >= $1`,
      [since],
    );
    let allTimeCompletes: number | null = null;
    if (since === null) {
      const [total] = await this.dataSource.query<
        (Pick<ListeningRow, 'listen_sec' | 'plays'> & { completes: number })[]
      >(
        `select coalesce(sum(listen_sec), 0)::float8 as listen_sec,
                coalesce(sum(play_count), 0)::int as plays,
                coalesce(sum(complete_count), 0)::int as completes
           from play_daily_totals`,
      );
      play.listen_sec = total.listen_sec;
      play.plays = total.plays;
      allTimeCompletes = total.completes;
    }
    const [complete] = await this.dataSource.query<CountRow[]>(
      `select count(*)::int as count from user_signals
        where action = 'complete' and ($1::timestamptz is null or created_at >= $1)`,
      [since],
    );
    const [save] = await this.dataSource.query<CountRow[]>(
      `select count(*)::int as count from library_items
        where source = 'save' and ($1::timestamptz is null or added_at >= $1)`,
      [since],
    );

    return {
      listenSec: play.listen_sec,
      plays: play.plays,
      completes: allTimeCompletes ?? complete.count,
      listeners: play.listeners,
      saves: save.count,
    };
  }

  /**
   * 일별 추이의 재료 — 날짜가 빈 칸은 Service 가 0 으로 채운다. 가입은 `users.created_at`이라 그날 가입했다가 탈퇴한
   * 사람은 빠진다(`withdrawal_logs`에는 가입일이 없다) — 일별 가입에도 생존 편향이 있다.
   */
  async dailyRows(since: Date): Promise<InsightsDailyRows> {
    const signups = await this.dataSource.query<DateCountRow[]>(
      `select ${kstDateExpr('created_at')} as date, count(*)::int as count
         from users where created_at >= $1 group by 1 order by 1`,
      [since],
    );
    const withdrawals = await this.dataSource.query<DateCountRow[]>(
      `select ${kstDateExpr('withdrawn_at')} as date, count(*)::int as count
         from withdrawal_logs where withdrawn_at >= $1 group by 1 order by 1`,
      [since],
    );
    const plays = await this.dataSource.query<DatePlaysRow[]>(
      `select ${kstDateExpr('played_at')} as date,
              count(*)::int as plays,
              count(distinct user_id)::int as listeners,
              coalesce(sum(listened_sec), 0)::float8 as listen_sec
         from play_records where played_at >= $1 group by 1 order by 1`,
      [since],
    );
    const completes = await this.dataSource.query<DateCountRow[]>(
      `select ${kstDateExpr('created_at')} as date, count(*)::int as count
         from user_signals where action = 'complete' and created_at >= $1 group by 1 order by 1`,
      [since],
    );

    return {
      signups,
      withdrawals,
      plays: plays.map((p) => ({
        date: p.date,
        plays: p.plays,
        listeners: p.listeners,
        listenSec: p.listen_sec,
      })),
      completes,
    };
  }

  /** 창 안 재생의 KST 시간대 분포 — 재생이 없던 시간대는 Service 가 0 으로 채운다 */
  async hourly(since: Date): Promise<InsightsHourly[]> {
    const rows = await this.dataSource.query<HourlyRow[]>(
      `select extract(hour from played_at at time zone 'Asia/Seoul')::int as hour,
              count(*)::int as plays,
              coalesce(sum(listened_sec), 0)::float8 as listen_sec
         from play_records where played_at >= $1 group by 1 order by 1`,
      [since],
    );
    return rows.map((r) => ({
      hour: r.hour,
      plays: r.plays,
      listenSec: r.listen_sec,
    }));
  }

  /**
   * 순위는 **전 기간**이다(admin-api 4.22) — `play_records` 전체를 한 번 훑는 비용은 계약상 피할 수 없다. 대신 완청·담기
   * 수는 상위 N 명을 고른 **뒤에** 그 사람들 것만 집계한다(2026-10-09 전체 검증) — 종전에는 select 목록의 상관
   * 서브쿼리가 재생 기록이 있는 **모든** 사용자마다 돌아, 사용자 수에 비례해 질의 수가 늘었다
   */
  async topUsers(limit: number): Promise<InsightsTopUser[]> {
    const rows = await this.dataSource.query<TopUserRow[]>(
      `with ranked as (
         select p.user_id,
                sum(p.listened_sec)::float8 as listen_sec,
                count(*)::int as plays,
                max(p.played_at) as last_played_at
           from play_records p
          group by p.user_id
          order by listen_sec desc, plays desc, last_played_at desc
          limit $1
       )
       select r.user_id,
              r.listen_sec,
              r.plays,
              coalesce(c.completes, 0)::int as completes,
              u.tier,
              u.created_at as signed_up_at,
              r.last_played_at
         from ranked r
         join users u on u.id = r.user_id
         left join lateral (
           select count(*)::int as completes from user_signals s
            where s.user_id = r.user_id and s.action = 'complete'
         ) c on true
        order by r.listen_sec desc, r.plays desc, r.last_played_at desc`,
      [limit],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      listenSec: r.listen_sec,
      plays: r.plays,
      completes: r.completes,
      tier: r.tier,
      signedUpAt: r.signed_up_at,
      lastPlayedAt: r.last_played_at,
    }));
  }

  async topContents(limit: number): Promise<InsightsTopContent[]> {
    const rows = await this.dataSource.query<TopContentRow[]>(
      `with ranked as (
         select p.content_id,
                sum(p.listened_sec)::float8 as listen_sec,
                count(*)::int as plays,
                count(distinct p.user_id)::int as listeners
           from play_records p
          group by p.content_id
          order by listen_sec desc, plays desc
          limit $1
       )
       select r.content_id,
              c.title,
              c.duration_sec,
              r.listen_sec,
              r.plays,
              r.listeners,
              coalesce(x.completes, 0)::int as completes,
              coalesce(v.saves, 0)::int as saves
         from ranked r
         join contents c on c.id = r.content_id
         left join lateral (
           select count(*)::int as completes from user_signals s
            where s.content_id = r.content_id and s.action = 'complete'
         ) x on true
         left join lateral (
           select count(*)::int as saves from library_items i
            where i.content_id = r.content_id and i.source = 'save'
         ) v on true
        order by r.listen_sec desc, r.plays desc`,
      [limit],
    );
    return rows.map((r) => ({
      contentId: r.content_id,
      title: r.title,
      durationSec: r.duration_sec,
      listenSec: r.listen_sec,
      plays: r.plays,
      listeners: r.listeners,
      completes: r.completes,
      saves: r.saves,
    }));
  }

  async withdrawalReasons(): Promise<InsightsWithdrawalReason[]> {
    const rows = await this.dataSource.query<ReasonRow[]>(
      `select reason_code, count(*)::int as count from withdrawal_logs
        group by reason_code order by count desc, reason_code`,
    );
    return rows.map((r) => ({ reasonCode: r.reason_code, count: r.count }));
  }

  /**
   * 리텐션 — 가입한 지 `day`일이 지난 현재 계정 중 가입 `day`일 뒤에도 **앱을 쓴** 사람. "앱을 썼다"는 그날 이후의 토큰
   * 갱신(`sessions.issued_at`) 또는 재생(`play_records`)이다 — 세션 행은 30일만 보존되므로(auth.constant) 영구 보존되는
   * 재생 기록을 합쳐 지난 창의 공백을 메운다. 그날 하루만 보는(bounded) 방식이 아니라 그날 이후 아무 때나(unbounded) —
   * 수백 명 규모에서 하루 단위는 표본이 너무 작다. 탈퇴자는 `users`에 없어 분모에서 빠진다(생존 편향).
   */
  async retention(
    days: readonly number[],
    now: Date,
  ): Promise<InsightsRetention[]> {
    const rows = await this.dataSource.query<RetentionRow[]>(
      `select n.day::int as day,
              count(u.id)::int as cohort_size,
              count(u.id) filter (where exists (
                select 1 from sessions s
                 where s.user_id = u.id
                   and s.issued_at >= u.created_at + make_interval(days => n.day)
              ) or exists (
                select 1 from play_records p
                 where p.user_id = u.id
                   and p.played_at >= u.created_at + make_interval(days => n.day)
              ))::int as returned
         from unnest($1::int[]) as n(day)
         left join users u on u.created_at <= $2::timestamptz - make_interval(days => n.day)
        group by n.day
        order by n.day`,
      [days, now],
    );
    return rows.map((r) => ({
      day: r.day,
      cohortSize: r.cohort_size,
      returned: r.returned,
    }));
  }

  /**
   * 주제별 수요·공급. "남은 편수"는 드립 후보 필터(`drip-scheduling.md` 4.2-1)와 같은 기준이다 — 라이브러리에
   * 한 번이라도 들어온 것(소프트 삭제분 포함)과 드립 영구 제외(`drip_excluded_contents`)를 뺀다. 시리즈 순서
   * 게이트는 반영하지 않는 근사다(운영 시리즈 0편, 2026-10-13).
   *
   * 노출 중인 주제와, 숨김이어도 관심 사용자가 남아 있는 주제를 싣는다. 관심 사용자가 많은 순으로 정렬한다(같으면 발행 편수가 적은 쪽 먼저 — 2026-10-13 사용자 요청).
   */
  async topicSupply(since: Date, now: Date): Promise<InsightsTopicSupply[]> {
    const rows = await this.dataSource.query<TopicSupplyRow[]>(
      `with visible as (
         select ct.topic_id, c.id as content_id, c.published_at
           from content_topics ct
           join contents c on c.id = ct.content_id
          where c.status = 'published'
            and (c.license_expires_at is null or c.license_expires_at > $2)
       ),
       demand as (
         select ui.topic_id, ui.user_id
           from user_interests ui
           join users u on u.id = ui.user_id
          where ui.is_active and u.onboarding_completed
       ),
       remaining as (
         select d.topic_id, d.user_id,
                count(v.content_id) filter (where
                  not exists (select 1 from library_items li
                               where li.user_id = d.user_id and li.content_id = v.content_id)
                  and not exists (select 1 from drip_excluded_contents x
                                   where x.user_id = d.user_id and x.content_id = v.content_id)
                )::int as remaining
           from demand d
           left join visible v on v.topic_id = d.topic_id
          group by d.topic_id, d.user_id
       ),
       supply as (
         select topic_id,
                count(*)::int as published,
                count(*) filter (where published_at >= $1)::int as published_in_window
           from visible
          group by topic_id
       ),
       per_topic as (
         select topic_id,
                count(*)::int as interested_users,
                percentile_cont(0.5) within group (order by remaining)::float8 as median_remaining,
                count(*) filter (where remaining = 0)::int as exhausted_users,
                count(*) filter (where remaining <= 2)::int as low_users
           from remaining
          group by topic_id
       )
       select t.id as topic_id, t.name, t.is_visible,
              coalesce(s.published, 0)::int as published,
              coalesce(s.published_in_window, 0)::int as published_in_window,
              coalesce(p.interested_users, 0)::int as interested_users,
              coalesce(p.median_remaining, 0)::float8 as median_remaining,
              coalesce(p.exhausted_users, 0)::int as exhausted_users,
              coalesce(p.low_users, 0)::int as low_users
         from topics t
         left join supply s on s.topic_id = t.id
         left join per_topic p on p.topic_id = t.id
        where t.is_visible or p.interested_users > 0
        order by coalesce(p.interested_users, 0) desc,
                 coalesce(s.published, 0),
                 t.display_order`,
      [since, now],
    );
    return rows.map((r) => ({
      topicId: r.topic_id,
      name: r.name,
      isVisible: r.is_visible,
      published: r.published,
      publishedInWindow: r.published_in_window,
      interestedUsers: r.interested_users,
      medianRemaining: r.median_remaining,
      exhaustedUsers: r.exhausted_users,
      lowUsers: r.low_users,
    }));
  }
}
