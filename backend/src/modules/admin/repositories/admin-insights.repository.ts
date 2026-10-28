import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { UserMarket } from '@/modules/user/user.enum';

import {
  InsightsCohortCounts,
  InsightsCompletionContentRow,
  InsightsDailyRows,
  InsightsFunnelCohortCounts,
  InsightsHourly,
  InsightsInviteCodeBaseline,
  InsightsInviteCodeCohort,
  InsightsListeningTotals,
  InsightsMarketTotals,
  InsightsPushReaction,
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
  paid_ever: number;
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

/** `offset`은 SQL 예약어라 열 이름을 `step`으로 받는다 */
interface CohortHitRow {
  start: string;
  step: number;
  returned: number;
}

/** KST 달력일 라벨 — 검색 로그 요약(`search-query-log.repository.ts`)과 같은 기준 */
const kstDateExpr = (column: string): string =>
  `to_char((${column} at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')`;

/**
 * 시장 필터(`admin-api.md` 4.22 `market`, 2026-10-25) — 바인딩 `param`이 null 이면 전체다. 사용자 축은 **지금 시장**
 * (`users.market`)으로 가른다: 시장을 옮긴 사람의 지난 기록도 새 시장으로 셈한다(전환은 드물다 — 결정 2026-10-25).
 * 쿼리 상수 조각이라 인자는 이 파일의 리터럴(열 이름·`$n`)뿐이다.
 */
const marketIs = (column: string, param: string): string =>
  `(${param}::varchar is null or ${column} = ${param})`;
/** `userIdColumn`의 사용자가 그 시장인가 — `users`를 직접 읽지 않는 표(재생·세션·신호·구독)용 */
const userInMarket = (userIdColumn: string, param: string): string =>
  `(${param}::varchar is null or ${userIdColumn} in (select mu.id from users mu where mu.market = ${param}))`;

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
           where u.tier = '${tier}' and ${marketIs('u.market', '$2')}
             and exists (select 1 from invite_code_redemptions r
                         where r.user_id = u.id and r.tier = '${tier}' and r.starts_at <= $1 and r.ends_at > $1)
             and not exists (select 1 from subscriptions s
                         where s.user_id = u.id and s.status in ('active', 'grace', 'cancelled') and s.expires_at > $1
                           and s.tier in (${tier === 'daily' ? "'daily', 'pro'" : "'pro'"})))::int`;

@Injectable()
export class AdminInsightsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async userTotals(
    now: Date,
    market: UserMarket | null = null,
  ): Promise<InsightsUserTotals> {
    const u = marketIs('market', '$2');
    const byUser = userInMarket('user_id', '$2');
    const [row] = await this.dataSource.query<UserTotalsRow[]>(
      `select
         (select count(*) from users where ${u})::int as current,
         (select count(*) from withdrawal_logs where ${u})::int as withdrawals,
         (select count(*) from users where onboarding_completed and ${u})::int as onboarding_completed,
         (select count(*) from users where trial_ends_at > $1 and ${u})::int as trial_active,
         (select count(*) from users where tier = 'light' and ${u})::int as tier_light,
         (select count(*) from users where tier = 'daily' and ${u})::int as tier_daily,
         (select count(*) from users where tier = 'pro' and ${u})::int as tier_pro,
         ${EVENT_TIER_COUNT('daily')} as tier_daily_event,
         ${EVENT_TIER_COUNT('pro')} as tier_pro_event,
         (select count(distinct user_id) from subscriptions
           where status in ('active', 'grace', 'cancelled') and environment = 'production' and expires_at > $1
             and ${byUser})::int as paid_active,
         (select count(distinct user_id) from subscriptions
           where status <> 'refunded' and environment = 'production'
             and ${byUser})::int as paid_ever,
         (select count(distinct user_id) from play_records where ${byUser})::int as activated,
         (select count(distinct user_id) from sessions where issued_at >= $1::timestamptz - interval '1 day' and ${byUser})::int as active_1d,
         (select count(distinct user_id) from sessions where issued_at >= $1::timestamptz - interval '7 days' and ${byUser})::int as active_7d,
         (select count(distinct user_id) from sessions where issued_at >= $1::timestamptz - interval '30 days' and ${byUser})::int as active_30d,
         (select count(distinct user_id) from play_records where played_at >= $1::timestamptz - interval '1 day' and ${byUser})::int as listeners_1d,
         (select count(distinct user_id) from play_records where played_at >= $1::timestamptz - interval '7 days' and ${byUser})::int as listeners_7d,
         (select count(distinct user_id) from play_records where played_at >= $1::timestamptz - interval '30 days' and ${byUser})::int as listeners_30d`,
      [now, market],
    );
    const byProvider = await this.dataSource.query<ProviderRow[]>(
      `select provider, count(*)::int as count from users where ${marketIs('market', '$1')}
        group by provider order by count desc, provider`,
      [market],
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
      paidEver: row.paid_ever,
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
  async listeningTotals(
    since: Date | null,
    market: UserMarket | null = null,
  ): Promise<InsightsListeningTotals> {
    const byUser = userInMarket('user_id', '$2');
    const [play] = await this.dataSource.query<ListeningRow[]>(
      `select coalesce(sum(listened_sec), 0)::float8 as listen_sec,
              count(*)::int as plays,
              count(distinct user_id)::int as listeners
         from play_records
        where ($1::timestamptz is null or played_at >= $1) and ${byUser}`,
      [since, market],
    );
    let allTimeCompletes: number | null = null;
    // 줄지 않는 누적(`play_daily_totals`)은 시장 열이 없다 — 시장을 고르면 전 기간도 재생 행(현재 계정 기준)으로 센다
    if (since === null && market === null) {
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
        where action = 'complete' and ($1::timestamptz is null or created_at >= $1) and ${byUser}`,
      [since, market],
    );
    // 담기 = **사용자가 직접 담은 수**(`user_signals.save`). 종전 `library_items.source = save`는 탐색 재생 자동 적립 행도 같은
    // 출처라 섞였고, 새 앱(자동 적립 폐기 — 2026-10-23)이 나가면 그만큼 급락해 추이가 끊긴다. 신호는 직접 담기에만 남는다
    // (explore-api.md 4.3). 신호는 180일 보존이라 전 기간 값도 그 안이다
    const [save] = await this.dataSource.query<CountRow[]>(
      `select count(*)::int as count from user_signals
        where action = 'save' and ($1::timestamptz is null or created_at >= $1) and ${byUser}`,
      [since, market],
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
   *
   * 접속자는 두 갈래다 — 저장 표(`daily_active_users`, auth 모듈이 매일 쓰는 집계 — 여기서는 읽기만)는 `since`의 KST 날짜부터,
   * 세션 바로 세기는 `liveFrom`(KST `YYYY-MM-DD`, 세션이 온전히 남아 있는 첫 날)부터다. 어느 쪽을 쓸지는 Service 가 고른다.
   * 접속자는 시장을 나누지 않는다(한 사용자는 한 시장이라 시장 합 = 전체 distinct).
   */
  async dailyRows(
    since: Date,
    liveFrom: string,
    market: UserMarket | null = null,
  ): Promise<InsightsDailyRows> {
    const byUser = userInMarket('user_id', '$2');
    const signups = await this.dataSource.query<DateCountRow[]>(
      `select ${kstDateExpr('created_at')} as date, count(*)::int as count
         from users where created_at >= $1 and ${marketIs('market', '$2')} group by 1 order by 1`,
      [since, market],
    );
    // 탈퇴는 탈퇴 당시 시장(`withdrawal_logs.market` — 계정이 지워져 지금 시장이 없다)
    const withdrawals = await this.dataSource.query<DateCountRow[]>(
      `select ${kstDateExpr('withdrawn_at')} as date, count(*)::int as count
         from withdrawal_logs where withdrawn_at >= $1 and ${marketIs('market', '$2')} group by 1 order by 1`,
      [since, market],
    );
    const plays = await this.dataSource.query<DatePlaysRow[]>(
      `select ${kstDateExpr('played_at')} as date,
              count(*)::int as plays,
              count(distinct user_id)::int as listeners,
              coalesce(sum(listened_sec), 0)::float8 as listen_sec
         from play_records where played_at >= $1 and ${byUser} group by 1 order by 1`,
      [since, market],
    );
    const completes = await this.dataSource.query<DateCountRow[]>(
      `select ${kstDateExpr('created_at')} as date, count(*)::int as count
         from user_signals where action = 'complete' and created_at >= $1 and ${byUser} group by 1 order by 1`,
      [since, market],
    );

    // 저장 표는 그날의 시장별 행이다(그날 시장 기준) — 시장을 고르면 그 행만
    const activeUsersStored = await this.dataSource.query<DateCountRow[]>(
      `select to_char(active_date, 'YYYY-MM-DD') as date, sum(active_users)::int as count
         from daily_active_users
        where active_date >= ($1::timestamptz at time zone 'Asia/Seoul')::date and ${marketIs('market', '$2')}
        group by active_date order by active_date`,
      [since, market],
    );
    const activeUsersLive = await this.dataSource.query<DateCountRow[]>(
      `select ${kstDateExpr('issued_at')} as date, count(distinct user_id)::int as count
         from sessions
        where issued_at >= ($1::date)::timestamp at time zone 'Asia/Seoul' and ${byUser}
        group by 1 order by 1`,
      [liveFrom, market],
    );

    return {
      signups,
      withdrawals,
      activeUsersStored,
      activeUsersLive,
      plays: plays.map((p) => ({
        date: p.date,
        plays: p.plays,
        listeners: p.listeners,
        listenSec: p.listen_sec,
      })),
      completes,
    };
  }

  /** 저장 표(`daily_active_users`)의 가장 이른 날(`YYYY-MM-DD`) — 표가 비었으면 null */
  async activeUsersFirstDate(): Promise<string | null> {
    const [row] = await this.dataSource.query<{ date: string | null }[]>(
      `select to_char(min(active_date), 'YYYY-MM-DD') as date from daily_active_users`,
    );
    return row?.date ?? null;
  }

  /**
   * 사람별 접속일(`user_active_dates`, auth 모듈이 쓴다 — 여기서는 읽기만)이 처음 쓰인 시각 — 마이그레이션 백필 시각이다.
   * 백필은 그때 남은 세션으로 채웠으니, 이 시각 - 29일부터의 날만 온전하다(Service 가 계산). 표가 비었으면 null.
   */
  async activeDatesFirstRecordedAt(): Promise<Date | null> {
    const [row] = await this.dataSource.query<{ at: Date | null }[]>(
      `select min(created_at) as at from user_active_dates`,
    );
    return row?.at ?? null;
  }

  /** 창 안 재생의 KST 시간대 분포 — 재생이 없던 시간대는 Service 가 0 으로 채운다 */
  async hourly(
    since: Date,
    market: UserMarket | null = null,
  ): Promise<InsightsHourly[]> {
    const rows = await this.dataSource.query<HourlyRow[]>(
      `select extract(hour from played_at at time zone 'Asia/Seoul')::int as hour,
              count(*)::int as plays,
              coalesce(sum(listened_sec), 0)::float8 as listen_sec
         from play_records where played_at >= $1 and ${userInMarket('user_id', '$2')} group by 1 order by 1`,
      [since, market],
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
  async topUsers(
    limit: number,
    market: UserMarket | null = null,
  ): Promise<InsightsTopUser[]> {
    const rows = await this.dataSource.query<TopUserRow[]>(
      `with ranked as (
         select p.user_id,
                sum(p.listened_sec)::float8 as listen_sec,
                count(*)::int as plays,
                max(p.played_at) as last_played_at
           from play_records p
          where ${userInMarket('p.user_id', '$2')}
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
      [limit, market],
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

  /**
   * 콘텐츠 순위. `since`가 null 이면 전 기간(청취 시간 순), 있으면 그 시각 이후만 센다 — 재생·청취자는 그 뒤에 시작한 재생,
   * 완청·담기도 그 뒤에 생긴 것만. `rankBy`가 `listeners`면 청취자 수 순이다(최근 하루 인기 — 한 사람이 오래 들은 편이
   * 위로 오지 않게). 같으면 청취 시간·재생 수 순.
   */
  async topContents(
    limit: number,
    since: Date | null = null,
    rankBy: 'listen_sec' | 'listeners' = 'listen_sec',
    market: UserMarket | null = null,
  ): Promise<InsightsTopContent[]> {
    // 안쪽(집계 열)과 바깥(`r.` 접두사) 두 번 쓴다 — 바깥 조인이 순서를 보장하지 않는다
    const keys =
      rankBy === 'listeners'
        ? ['listeners', 'listen_sec', 'plays']
        : ['listen_sec', 'plays'];
    const order = (prefix: string) =>
      keys.map((k) => `${prefix}${k} desc`).join(', ');
    const rows = await this.dataSource.query<TopContentRow[]>(
      `with ranked as (
         select p.content_id,
                sum(p.listened_sec)::float8 as listen_sec,
                count(*)::int as plays,
                count(distinct p.user_id)::int as listeners
           from play_records p
          where ($2::timestamptz is null or p.played_at >= $2) and ${userInMarket('p.user_id', '$3')}
          group by p.content_id
          order by ${order('')}
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
              and ($2::timestamptz is null or s.created_at >= $2) and ${userInMarket('s.user_id', '$3')}
         ) x on true
         left join lateral (
           select count(*)::int as saves from user_signals i
            where i.content_id = r.content_id and i.action = 'save'
              and ($2::timestamptz is null or i.created_at >= $2) and ${userInMarket('i.user_id', '$3')}
         ) v on true
        order by ${order('r.')}`,
      [limit, since, market],
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

  /**
   * 알림 반응(2026-10-26 — `notification.md` 4.6 성과). 창(`since` 이후) 안에 **보낸**(`sent`) 드립 도착·리텐션 알림을
   * 종류(`notification_logs.type` — 리텐션은 `retention.<규칙>.<변형>`)별로 세고, 그중 **보낸 뒤 2시간 안에 재생**한 건을 센다.
   * 재생 = 그 사이 새 재생 행(`play_records.played_at`) 또는 재생 위치 저장(`playback_progresses.updated_at`). 앱이 알림 탭을
   * 서버에 알리지 않아(`opened_at`은 비어 있다) 탭 대신 재생으로 역산한다 — 탭 없이 앱을 열어 들은 것도 반응으로 잡히고,
   * 2시간 안에 들은 뒤 더 늦게 다시 들어 위치 저장 시각이 밀린 경우는 새 재생 행이 없으면 빠진다(근사).
   */
  async pushReactions(
    since: Date,
    market: UserMarket | null = null,
  ): Promise<InsightsPushReaction[]> {
    const rows = await this.dataSource.query<
      { type: string; sent: number; reacted: number }[]
    >(
      `select l.type,
              count(*)::int as sent,
              count(*) filter (where exists (
                select 1 from play_records p
                 where p.user_id = l.user_id
                   and p.played_at >= l.sent_at and p.played_at < l.sent_at + interval '2 hours'
              ) or exists (
                select 1 from playback_progresses pp
                 where pp.user_id = l.user_id
                   and pp.updated_at >= l.sent_at and pp.updated_at < l.sent_at + interval '2 hours'
              ))::int as reacted
         from notification_logs l
        where l.status = 'sent' and l.sent_at >= $1
          and (l.type = 'drip_arrival' or l.type like 'retention.%')
          and ${userInMarket('l.user_id', '$2')}
        group by l.type
        order by l.type`,
      [since, market],
    );
    return rows.map((r) => ({
      type: r.type,
      sent: r.sent,
      reacted: r.reacted,
    }));
  }

  /**
   * 초대 코드(프로모션)별 묶음 지표(2026-10-28 — 로그 콘솔 "프로모션" 탭). 코드를 입력한 **현재 계정**을 코드마다 묶고, 코드를 한 번도
   * 입력하지 않은 현재 계정을 기준선으로 함께 센다. 활성은 세션(`sessions.issued_at`, 지표 탭 `active_7d`와 같다), 청취는 재생 행,
   * 결제는 실결제(`production`, 환불 제외). 탈퇴하면 입력 기록이 함께 지워져(CASCADE) 탈퇴자는 `redeemed - current`로만 보인다.
   */
  async inviteCodeCohorts(
    since: Date,
    now: Date,
  ): Promise<{
    codes: InsightsInviteCodeCohort[];
    baseline: InsightsInviteCodeBaseline;
  }> {
    // `left join` 쪽(코드 묶음)은 입력 기록이 없는 코드도 한 줄이라 `count(r.user_id)`로 센다 — `count(*)`면 빈 코드가 1로 나온다
    const metrics = (userColumn: string, counted: string) => `
              count(${counted}) filter (where exists (
                select 1 from sessions s
                 where s.user_id = ${userColumn} and s.issued_at >= $2::timestamptz - interval '7 days'
              ))::int as active_7d,
              count(${counted}) filter (where exists (
                select 1 from play_records p
                 where p.user_id = ${userColumn} and p.played_at >= $2::timestamptz - interval '7 days'
              ))::int as listeners_7d,
              coalesce(sum((
                select sum(p.listened_sec) from play_records p
                 where p.user_id = ${userColumn} and p.played_at >= $1
              )), 0)::float8 as listen_sec`;
    const codes = await this.dataSource.query<
      {
        code: string;
        name: string;
        tier: string;
        grant_days: number | null;
        grant_until_date: string | null;
        is_active: boolean;
        redeemed: number;
        current: number;
        active_grants: number;
        ended_grants: number;
        active_7d: number;
        listeners_7d: number;
        listen_sec: number;
        paid_after_start: number;
      }[]
    >(
      `select c.code, c.name, c.tier::text as tier, c.grant_days,
              to_char(c.grant_until_date, 'YYYY-MM-DD') as grant_until_date,
              c.is_active, c.redeemed_count::int as redeemed,
              count(r.user_id)::int as current,
              count(r.user_id) filter (where r.starts_at <= $2 and r.ends_at > $2)::int as active_grants,
              count(r.user_id) filter (where r.ends_at <= $2)::int as ended_grants,
              ${metrics('r.user_id', 'r.user_id')},
              count(r.user_id) filter (where exists (
                select 1 from subscriptions sub
                 where sub.user_id = r.user_id and sub.environment = 'production'
                   and sub.status <> 'refunded' and sub.started_at >= r.starts_at
              ))::int as paid_after_start
         from invite_codes c
         left join invite_code_redemptions r on r.invite_code_id = c.id
        group by c.id
        order by c.redeemed_count desc, c.code`,
      [since, now],
    );
    const [baseline] = await this.dataSource.query<
      {
        current: number;
        active_7d: number;
        listeners_7d: number;
        listen_sec: number;
        paid_ever: number;
      }[]
    >(
      `select count(*)::int as current,
              ${metrics('u.id', '*')},
              count(*) filter (where exists (
                select 1 from subscriptions sub
                 where sub.user_id = u.id and sub.environment = 'production' and sub.status <> 'refunded'
              ))::int as paid_ever
         from users u
        where not exists (select 1 from invite_code_redemptions r where r.user_id = u.id)`,
      [since, now],
    );

    return {
      codes: codes.map((row) => ({
        code: row.code,
        name: row.name,
        tier: row.tier,
        grantDays: row.grant_days,
        grantUntilDate: row.grant_until_date,
        isActive: row.is_active,
        redeemed: row.redeemed,
        current: row.current,
        activeGrants: row.active_grants,
        endedGrants: row.ended_grants,
        active7d: row.active_7d,
        listeners7d: row.listeners_7d,
        listenSec: Number(row.listen_sec),
        paidAfterStart: row.paid_after_start,
      })),
      baseline: {
        current: baseline?.current ?? 0,
        active7d: baseline?.active_7d ?? 0,
        listeners7d: baseline?.listeners_7d ?? 0,
        listenSec: Number(baseline?.listen_sec ?? 0),
        paidEver: baseline?.paid_ever ?? 0,
      },
    };
  }

  async withdrawalReasons(
    market: UserMarket | null = null,
  ): Promise<InsightsWithdrawalReason[]> {
    const rows = await this.dataSource.query<ReasonRow[]>(
      `select reason_code, count(*)::int as count from withdrawal_logs
        where ${marketIs('market', '$1')}
        group by reason_code order by count desc, reason_code`,
      [market],
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
    market: UserMarket | null = null,
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
                          and ${marketIs('u.market', '$3')}
        group by n.day
        order by n.day`,
      [days, now, market],
    );
    return rows.map((r) => ({
      day: r.day,
      cohortSize: r.cohort_size,
      returned: r.returned,
    }));
  }

  /**
   * **바운디드 N일 리텐션**(classic N-day — 업계 벤치마크와 같은 정의, 2026-10-26). 가입한 KST 달력일 `d`의 현재 계정 중
   * **정확히 `d + N`일 하루 안에** 앱을 쓴(접속 또는 재생) 사람. 접속 원천은 코호트 표와 같다(`user_active_dates` · 남은
   * `sessions` · `play_records`) — 이 값은 코호트 표 D1·D7 칸을 전 기간 묶음에 대해 가중 평균한 것과 같다.
   *
   * 분모는 `d + N`일이 **다 지났고**(`< today`) 그날 접속 기록을 **믿을 수 있는**(`>= reliableSince`) 가입자만이다 — 아직 오지
   * 않은 날, 세션이 지워져 재생만 남은 날을 분모에 넣으면 낮게 나온다. 탈퇴자는 `users`에 없어 빠진다(생존 편향 — 다른 리텐션과 같다).
   */
  async boundedRetention(
    days: readonly number[],
    today: string,
    reliableSince: string,
    market: UserMarket | null = null,
  ): Promise<InsightsRetention[]> {
    const rows = await this.dataSource.query<RetentionRow[]>(
      `with cohort as (
         select u.id, n.day,
                (u.created_at at time zone 'Asia/Seoul')::date + n.day as target
           from unnest($1::int[]) as n(day)
           join users u
             on (u.created_at at time zone 'Asia/Seoul')::date + n.day < $2::date
            and (u.created_at at time zone 'Asia/Seoul')::date + n.day >= $3::date
            and ${marketIs('u.market', '$4')}
       )
       select n.day::int as day,
              count(c.id)::int as cohort_size,
              count(c.id) filter (where exists (
                select 1 from user_active_dates a
                 where a.user_id = c.id and a.active_date = c.target
              ) or exists (
                select 1 from sessions s
                 where s.user_id = c.id
                   and s.issued_at >= c.target::timestamp at time zone 'Asia/Seoul'
                   and s.issued_at < (c.target + 1)::timestamp at time zone 'Asia/Seoul'
              ) or exists (
                select 1 from play_records p
                 where p.user_id = c.id
                   and p.played_at >= c.target::timestamp at time zone 'Asia/Seoul'
                   and p.played_at < (c.target + 1)::timestamp at time zone 'Asia/Seoul'
              ))::int as returned
         from unnest($1::int[]) as n(day)
         left join cohort c on c.day = n.day
        group by n.day
        order by n.day`,
      [days, today, reliableSince, market],
    );
    return rows.map((r) => ({
      day: r.day,
      cohortSize: r.cohort_size,
      returned: r.returned,
    }));
  }

  /**
   * 코호트 리텐션의 재료 — 가입한 KST 달력일 `[from, to)`의 현재 계정을 `span`일 단위(1 = 일별, 7 = ISO 주, 월요일 시작)로 묶고,
   * 묶음마다 가입자 수와 "가입 뒤 `offset` 구간에 앱을 쓴 사람 수"를 센다. 구간은 **사람마다 자기 가입일 기준**이다 —
   * `offset`번째 구간 = 가입일 + `offset × span`일부터 `span`일(D1 = 가입 다음 날 하루, W1 = 가입 7~13일 뒤).
   *
   * "앱을 썼다"는 그날 접속(`user_active_dates` — 지워진 세션의 몫까지 남는 기록 · 아직 남은 `sessions`) 또는 재생(`play_records`,
   * 무기한)이다. 아직 끝나지 않은 구간인지·기록을 믿을 수 있는지는 Service 가 가린다 — 여기서는 있는 대로 센다.
   * 탈퇴자는 `users`에 없어 분모·분자 모두에서 빠진다(생존 편향 — 기존 `retention`과 같다).
   */
  async cohortRetention(
    from: string,
    to: string,
    span: number,
    offsets: readonly number[],
    market: UserMarket | null = null,
  ): Promise<InsightsCohortCounts> {
    // 크기 질의는 `$4`(offsets)를 쓰지 않아 시장 자리가 다르다 — 쓰지 않는 자리를 두면 형 추론이 실패한다
    const cohort = (marketParam: string) => `
      cohort as (
        select u.id,
               (u.created_at at time zone 'Asia/Seoul')::date as d
          from users u
         where u.created_at >= ($1::date)::timestamp at time zone 'Asia/Seoul'
           and u.created_at < ($2::date)::timestamp at time zone 'Asia/Seoul'
           and ${marketIs('u.market', marketParam)}
      ),
      keyed as (
        select c.id, c.d,
               case when $3::int = 7 then date_trunc('week', c.d)::date else c.d end as start
          from cohort c
      )`;
    const sizes = await this.dataSource.query<InsightsCohortCounts['sizes']>(
      `with ${cohort('$4')}
       select to_char(k.start, 'YYYY-MM-DD') as start, count(*)::int as users
         from keyed k
        group by k.start`,
      [from, to, span, market],
    );
    const hits = await this.dataSource.query<CohortHitRow[]>(
      `with ${cohort('$5')},
       activity as (
         select a.user_id, a.active_date
           from user_active_dates a join cohort c on c.id = a.user_id
         union
         select s.user_id, (s.issued_at at time zone 'Asia/Seoul')::date
           from sessions s join cohort c on c.id = s.user_id
         union
         select p.user_id, (p.played_at at time zone 'Asia/Seoul')::date
           from play_records p join cohort c on c.id = p.user_id
       )
       select to_char(k.start, 'YYYY-MM-DD') as start,
              o.n::int as step,
              count(distinct k.id)::int as returned
         from keyed k
        cross join unnest($4::int[]) as o(n)
         join activity a
           on a.user_id = k.id
          and a.active_date >= k.d + o.n * $3::int
          and a.active_date < k.d + (o.n + 1) * $3::int
        group by k.start, o.n`,
      [from, to, span, offsets, market],
    );
    return {
      sizes,
      hits: hits.map((h) => ({
        start: h.start,
        offset: h.step,
        returned: h.returned,
      })),
    };
  }

  /**
   * 주제별 수요·공급. "남은 편수"는 드립 후보 필터(`drip-scheduling.md` 4.2-1)와 같은 기준이다 — 라이브러리에
   * 한 번이라도 들어온 것(소프트 삭제분 포함)과 드립 영구 제외(`drip_excluded_contents`)를 뺀다. 시리즈 순서
   * 게이트는 반영하지 않는 근사다(운영 시리즈 0편, 2026-10-13).
   *
   * 노출 중인 주제와, 숨김이어도 관심 사용자가 남아 있는 주제를 싣는다. 관심 사용자가 많은 순으로 정렬한다(같으면 발행 편수가 적은 쪽 먼저 — 2026-10-13 사용자 요청).
   */
  async topicSupply(
    since: Date,
    now: Date,
    market: UserMarket | null = null,
  ): Promise<InsightsTopicSupply[]> {
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
          where ui.is_active and u.onboarding_completed and ${marketIs('u.market', '$3')}
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
        where (t.is_visible or p.interested_users > 0) and ${marketIs('t.market', '$3')}
        order by coalesce(p.interested_users, 0) desc,
                 coalesce(s.published, 0),
                 t.display_order`,
      [since, now, market],
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

  /**
   * 가입 주 코호트 퍼널 재료(`GET /admin/insights/funnel`) — 묶음마다 `[startAt, endAt)`에 가입한 현재 계정 수와 단계별 도달자 수. 묶음 경계는
   * Service 가 서비스 주(월 05:00)를 시각으로 바꿔 넘긴다(`serviceDateStart` — 04:00 → 05:00 전환을 이 파일이 다시 계산하지 않게).
   *
   * - 첫 재생 24h: 가입 시각 + `firstPlayHours` 안의 재생 행(0초 포함 — "눌러 봤다"). 첫 재생 전체: 재생 행이 하나라도.
   * - 첫 완청: 완청 신호(`user_signals.action = complete`)가 하나라도 — 신호는 180일 보존이라 그보다 오래된 완청은 빠질 수 있다.
   * - W1 복귀: 가입 KST 달력일 + 7 ~ +13일에 접속(`user_active_dates` · 남은 `sessions`) 또는 재생 — 코호트 리텐션 표 W1 과 같은 정의.
   * - 첫 14일 습관: 가입 시각 + `habitDays`일 안에 들은(`listened_sec > 0`) 서로 다른 `play_date`가 `minPlayDays`일 이상.
   * - 결제: 실결제(`environment = production`, 환불 제외)가 한 번이라도.
   *
   * **단계는 깔때기다** — 각 단계는 앞 단계를 모두 통과한 사람만 센다(예: W1 복귀 = 24시간 안에 듣고 첫 완청까지 한 사람 중 복귀).
   * 처음에는 단계마다 따로 셌는데, 그러면 "첫 완청 → W1 75%"가 완청 안 한 복귀자까지 분자에 넣은 값이 되어 "완청한 사람의 75%가
   * 돌아왔다"로 잘못 읽혔다(실제 16%, 2026-10-28). 첫 재생 전체(`first_play_ever`)는 단계가 아닌 참고 값이라 따로 센다.
   *
   * 아직 끝나지 않은 단계를 가리는 것은 Service 다 — 여기서는 있는 대로 센다. 탈퇴자는 `users`에 없어 빠진다(생존 편향).
   */
  async funnelCohorts(
    cohorts: readonly { weekStart: string; startAt: Date; endAt: Date }[],
    options: { firstPlayHours: number; habitDays: number; minPlayDays: number },
    market: UserMarket | null = null,
  ): Promise<InsightsFunnelCohortCounts[]> {
    const rows = await this.dataSource.query<
      {
        week_start: string;
        signups: number;
        onboarding_completed: number;
        first_play_24h: number;
        first_play_ever: number;
        first_complete: number;
        w1_return: number;
        habit_14d: number;
        paid_ever: number;
      }[]
    >(
      `with w as (
         select * from unnest($1::text[], $2::timestamptz[], $3::timestamptz[]) as w(week_start, start_at, end_at)
       ),
       cohort as (
         select w.week_start, u.id, u.created_at, u.onboarding_completed,
                (u.created_at at time zone 'Asia/Seoul')::date as d
           from w
           join users u on u.created_at >= w.start_at and u.created_at < w.end_at
                       and ${marketIs('u.market', '$7')}
       ),
       flags as (
         select c.week_start, c.id, c.onboarding_completed,
                exists (select 1 from play_records p
                         where p.user_id = c.id
                           and p.played_at < c.created_at + make_interval(hours => $4::int)) as play_24h,
                exists (select 1 from play_records p where p.user_id = c.id) as play_ever,
                exists (select 1 from user_signals s
                         where s.user_id = c.id and s.action = 'complete') as completed,
                (exists (select 1 from user_active_dates a
                          where a.user_id = c.id and a.active_date >= c.d + 7 and a.active_date < c.d + 14)
                 or exists (select 1 from sessions s
                             where s.user_id = c.id
                               and s.issued_at >= (c.d + 7)::timestamp at time zone 'Asia/Seoul'
                               and s.issued_at < (c.d + 14)::timestamp at time zone 'Asia/Seoul')
                 or exists (select 1 from play_records p
                             where p.user_id = c.id
                               and p.played_at >= (c.d + 7)::timestamp at time zone 'Asia/Seoul'
                               and p.played_at < (c.d + 14)::timestamp at time zone 'Asia/Seoul')) as w1,
                (select count(distinct p.play_date) from play_records p
                  where p.user_id = c.id and p.listened_sec > 0
                    and p.played_at >= c.created_at
                    and p.played_at < c.created_at + make_interval(days => $5::int)) >= $6::int as habit,
                exists (select 1 from subscriptions s
                         where s.user_id = c.id and s.environment = 'production' and s.status <> 'refunded') as paid
           from cohort c
       )
       select w.week_start,
              count(f.id)::int as signups,
              -- 단계는 앞 단계를 모두 통과한 사람만 센다(깔때기) — 각 단계 = 앞 단계 AND 이 단계
              count(f.id) filter (where f.onboarding_completed)::int as onboarding_completed,
              count(f.id) filter (where f.onboarding_completed and f.play_24h)::int as first_play_24h,
              count(f.id) filter (where f.play_ever)::int as first_play_ever,
              count(f.id) filter (where f.onboarding_completed and f.play_24h and f.completed)::int as first_complete,
              count(f.id) filter (where f.onboarding_completed and f.play_24h and f.completed and f.w1)::int as w1_return,
              count(f.id) filter (where f.onboarding_completed and f.play_24h and f.completed and f.w1 and f.habit)::int as habit_14d,
              count(f.id) filter (where f.onboarding_completed and f.play_24h and f.completed and f.w1 and f.habit and f.paid)::int as paid_ever
         from w
         left join flags f on f.week_start = w.week_start
        group by w.week_start
        order by w.week_start desc`,
      [
        cohorts.map((c) => c.weekStart),
        cohorts.map((c) => c.startAt),
        cohorts.map((c) => c.endAt),
        options.firstPlayHours,
        options.habitDays,
        options.minPlayDays,
        market,
      ],
    );
    return rows.map((r) => ({
      weekStart: r.week_start,
      signups: r.signups,
      onboardingCompleted: r.onboarding_completed,
      firstPlay24h: r.first_play_24h,
      firstPlayEver: r.first_play_ever,
      firstComplete: r.first_complete,
      w1Return: r.w1_return,
      habit14d: r.habit_14d,
      paidEver: r.paid_ever,
    }));
  }

  /**
   * 길이별 완청률 재료 — 편마다 들어 본 사람(0초가 아닌 재생 행이 있는 사용자)과 그중 완청한 사람. 단위는 (사용자, 편)이다.
   * 완청은 공용 정의(`LibraryItemRepository` 완청 CTE · `domain.md` 6장)와 같다 — 라이브러리 `completed` · 최대 도달 ≥ 길이 × 기준 ·
   * 완청 신호 중 하나. `market` 콘텐츠만, 길이가 있는 편만, 첫 재생이 `minAgeHours` 전인 (사용자, 편)만 센다(방금 시작한 사람 제외).
   * 편 제목은 싣지만 사용자는 수만 낸다.
   */
  async completionByContent(
    now: Date,
    options: { market: string; minAgeHours: number; reachedRatio: number },
  ): Promise<InsightsCompletionContentRow[]> {
    const rows = await this.dataSource.query<
      {
        content_id: string;
        title: string;
        duration_sec: number;
        starters: number;
        completers: number;
      }[]
    >(
      `with starts as (
         select p.user_id, p.content_id
           from play_records p
           join contents c on c.id = p.content_id
          where p.listened_sec > 0 and c.market = $1 and c.duration_sec > 0
          group by p.user_id, p.content_id
         having min(p.played_at) < $2::timestamptz - make_interval(hours => $3::int)
       ),
       flagged as (
         select s.content_id,
                (exists (select 1 from library_items i
                          where i.user_id = s.user_id and i.content_id = s.content_id and i.status = 'completed')
                 or exists (select 1 from playback_progresses g
                             join contents c on c.id = g.content_id
                             where g.user_id = s.user_id and g.content_id = s.content_id
                               and g.max_reached_sec >= c.duration_sec * $4::numeric)
                 or exists (select 1 from user_signals u
                             where u.user_id = s.user_id and u.content_id = s.content_id and u.action = 'complete')
                ) as completed
           from starts s
       )
       select c.id as content_id, c.title, c.duration_sec,
              count(*)::int as starters,
              count(*) filter (where f.completed)::int as completers
         from flagged f
         join contents c on c.id = f.content_id
        group by c.id, c.title, c.duration_sec
        order by c.duration_sec, c.id`,
      [options.market, now, options.minAgeHours, options.reachedRatio],
    );
    return rows.map((r) => ({
      contentId: r.content_id,
      title: r.title,
      durationSec: r.duration_sec,
      starters: r.starters,
      completers: r.completers,
    }));
  }
}
