import {
  InsightsCohortTable,
  InsightsListeningTotals,
  InsightsSummary,
} from '../admin.types';

/** 분모가 0 이면 null — 0% 와 "셀 수 없음"을 구분한다 */
export const ratio = (part: number, whole: number): number | null =>
  whole > 0 ? part / whole : null;

/** 코호트 표 한 장 — 칸은 `offsets` 순서, 끝나지 않은 구간은 `null` */
interface CohortTableItem {
  /** 1 = 일별(D) · 7 = 주별(W) */
  span: number;
  offsets: number[];
  /** 접속 기록을 믿을 수 있는 첫 날(KST `YYYY-MM-DD`) — 이보다 앞에서 시작하는 칸이 `partial` */
  reliable_since: string;
  rows: {
    /** 묶음 시작일(KST) — 일별은 가입일, 주별은 가입 주 월요일 */
    start: string;
    users: number;
    cells: ({
      returned: number;
      /** `returned / users` */
      rate: number | null;
      /** 접속 기록을 믿을 수 있는 첫 날 앞에서 시작하는 구간 — 재생만 잡혀 낮게 나온다 */
      partial: boolean;
    } | null)[];
  }[];
}

const toCohortTable = (t: InsightsCohortTable): CohortTableItem => ({
  span: t.span,
  offsets: t.offsets,
  reliable_since: t.reliableSince,
  rows: t.rows.map((r) => ({
    start: r.start,
    users: r.users,
    cells: r.cells.map((c) =>
      c === null
        ? null
        : {
            returned: c.returned,
            rate: ratio(c.returned, r.users),
            partial: c.partial,
          },
    ),
  })),
});

interface ListeningTotalsItem {
  listen_sec: number;
  plays: number;
  completes: number;
  /** `completes / plays` */
  complete_rate: number | null;
  listeners: number;
  saves: number;
  /** `listen_sec / plays` */
  avg_listen_sec_per_play: number | null;
  /** `listen_sec / listeners` */
  avg_listen_sec_per_listener: number | null;
}

/** `GET /admin/insights/summary` (admin-api.md 4.22) — 집계값과 `user_id`만. 이름·이메일은 없다 */
export class AdminInsightsSummaryResponseDto {
  readonly days: number;
  readonly since: string;
  readonly generated_at: string;
  readonly users: {
    total_signups: number;
    current: number;
    withdrawals: number;
    /** `withdrawals / total_signups` */
    withdrawal_rate: number | null;
    onboarding_completed: number;
    /** `onboarding_completed / current` */
    onboarding_rate: number | null;
    trial_active: number;
    tiers: { light: number; daily: number; pro: number };
    /** `tiers` 중 초대 코드 이벤트로 그 티어인 계정 수 — "Pro 30명 (이벤트 11명)"의 괄호 값 */
    tier_events: { daily: number; pro: number };
    paid_active: number;
    /** `paid_active / current` */
    paid_rate: number | null;
    activated: number;
    /** `activated / current` — 가입자 중 한 번이라도 재생한 비율 */
    activation_rate: number | null;
    /** 앱 사용(토큰 갱신) 기준 DAU·WAU·MAU */
    active_1d: number;
    active_7d: number;
    active_30d: number;
    /** `active_1d / active_30d` — DAU/MAU 고착도 */
    stickiness: number | null;
    /** 재생 기준 — 활성 사용자 중 청취까지 간 사람 */
    listeners_1d: number;
    listeners_7d: number;
    listeners_30d: number;
    /** `listeners_1d / active_1d` 등 — 활성 사용자 중 재생한 비율(청취 전환) */
    listener_rate_1d: number | null;
    listener_rate_7d: number | null;
    listener_rate_30d: number | null;
    by_provider: { provider: string; count: number }[];
  };
  readonly listening: {
    all_time: ListeningTotalsItem;
    window: ListeningTotalsItem;
  };
  readonly daily: {
    date: string;
    signups: number;
    withdrawals: number;
    plays: number;
    listeners: number;
    listen_sec: number;
    completes: number;
    /** 그날 접속자(토큰 갱신한 사람 — `active_1d`와 같은 신호). 기록이 없는 날(첫 신뢰 날짜 앞)은 null */
    active_users: number | null;
  }[];
  /** 요일별 평균 — 월(1)~일(7) 7칸, 창 안의 온전한 하루만 */
  readonly weekday: {
    weekday: number;
    label: string;
    days: number;
    active_days: number;
    avg_active_users: number | null;
    avg_listeners: number | null;
  }[];
  /** 접속자를 믿을 수 있는 첫 날(KST `YYYY-MM-DD`) — 화면 각주가 "M월 D일부터 집계"로 쓴다 */
  readonly active_users_since: string;
  readonly hourly: { hour: number; plays: number; listen_sec: number }[];
  readonly top_users: {
    user_id: string;
    listen_sec: number;
    plays: number;
    completes: number;
    tier: string;
    signed_up_at: string;
    last_played_at: string;
  }[];
  readonly top_contents: {
    content_id: string;
    title: string;
    duration_sec: number;
    listen_sec: number;
    plays: number;
    listeners: number;
    completes: number;
    /** `completes / plays` */
    complete_rate: number | null;
    saves: number;
  }[];
  readonly withdrawal_reasons: { reason_code: string | null; count: number }[];
  readonly retention: {
    day: number;
    cohort_size: number;
    returned: number;
    /** `returned / cohort_size` */
    rate: number | null;
  }[];
  /** 코호트 리텐션 — 가입일별 D1·D7, 가입 주별 W1~W4(절대수치·비율 함께) */
  readonly retention_cohorts: {
    daily: CohortTableItem;
    weekly: CohortTableItem;
  };
  /** 주제별 수요·공급 — 관심 사용자가 많은 순 */
  readonly topic_supply: {
    topic_id: string;
    name: string;
    is_visible: boolean;
    published: number;
    published_in_window: number;
    interested_users: number;
    median_remaining: number;
    exhausted_users: number;
    low_users: number;
  }[];

  /** 시장별 가입·활성·청취·결제(`global-api.md` 4.10) — 시장마다 한 칸, 현재 계정 기준 */
  readonly by_market: {
    market: string;
    users: number;
    signups_in_window: number;
    onboarding_completed: number;
    active_7d: number;
    listeners_7d: number;
    listen_sec: number;
    plays: number;
    paid_active: number;
  }[];

  static from(
    summary: InsightsSummary,
    days: number,
  ): AdminInsightsSummaryResponseDto {
    const toListening = (t: InsightsListeningTotals): ListeningTotalsItem => ({
      listen_sec: t.listenSec,
      plays: t.plays,
      completes: t.completes,
      complete_rate: ratio(t.completes, t.plays),
      listeners: t.listeners,
      saves: t.saves,
      avg_listen_sec_per_play: ratio(t.listenSec, t.plays),
      avg_listen_sec_per_listener: ratio(t.listenSec, t.listeners),
    });
    const u = summary.users;

    return {
      days,
      since: summary.since.toISOString(),
      generated_at: summary.generatedAt.toISOString(),
      users: {
        total_signups: u.totalSignups,
        current: u.current,
        withdrawals: u.withdrawals,
        withdrawal_rate: ratio(u.withdrawals, u.totalSignups),
        onboarding_completed: u.onboardingCompleted,
        onboarding_rate: ratio(u.onboardingCompleted, u.current),
        trial_active: u.trialActive,
        tiers: u.tiers,
        tier_events: u.tierEvents,
        paid_active: u.paidActive,
        paid_rate: ratio(u.paidActive, u.current),
        activated: u.activated,
        activation_rate: ratio(u.activated, u.current),
        active_1d: u.active1d,
        active_7d: u.active7d,
        active_30d: u.active30d,
        stickiness: ratio(u.active1d, u.active30d),
        listeners_1d: u.listeners1d,
        listeners_7d: u.listeners7d,
        listeners_30d: u.listeners30d,
        listener_rate_1d: ratio(u.listeners1d, u.active1d),
        listener_rate_7d: ratio(u.listeners7d, u.active7d),
        listener_rate_30d: ratio(u.listeners30d, u.active30d),
        by_provider: u.byProvider,
      },
      listening: {
        all_time: toListening(summary.listening.allTime),
        window: toListening(summary.listening.window),
      },
      daily: summary.daily.map((d) => ({
        date: d.date,
        signups: d.signups,
        withdrawals: d.withdrawals,
        plays: d.plays,
        listeners: d.listeners,
        listen_sec: d.listenSec,
        completes: d.completes,
        active_users: d.activeUsers,
      })),
      weekday: summary.weekday.map((w) => ({
        weekday: w.weekday,
        label: w.label,
        days: w.days,
        active_days: w.activeDays,
        avg_active_users: w.avgActiveUsers,
        avg_listeners: w.avgListeners,
      })),
      active_users_since: summary.activeUsersSince,
      hourly: summary.hourly.map((h) => ({
        hour: h.hour,
        plays: h.plays,
        listen_sec: h.listenSec,
      })),
      top_users: summary.topUsers.map((t) => ({
        user_id: t.userId,
        listen_sec: t.listenSec,
        plays: t.plays,
        completes: t.completes,
        tier: t.tier,
        signed_up_at: t.signedUpAt.toISOString(),
        last_played_at: t.lastPlayedAt.toISOString(),
      })),
      top_contents: summary.topContents.map((c) => ({
        content_id: c.contentId,
        title: c.title,
        duration_sec: c.durationSec,
        listen_sec: c.listenSec,
        plays: c.plays,
        listeners: c.listeners,
        completes: c.completes,
        complete_rate: ratio(c.completes, c.plays),
        saves: c.saves,
      })),
      withdrawal_reasons: summary.withdrawalReasons.map((r) => ({
        reason_code: r.reasonCode,
        count: r.count,
      })),
      retention: summary.retention.map((r) => ({
        day: r.day,
        cohort_size: r.cohortSize,
        returned: r.returned,
        rate: ratio(r.returned, r.cohortSize),
      })),
      retention_cohorts: {
        daily: toCohortTable(summary.retentionCohorts.daily),
        weekly: toCohortTable(summary.retentionCohorts.weekly),
      },
      topic_supply: summary.topicSupply.map((t) => ({
        topic_id: t.topicId,
        name: t.name,
        is_visible: t.isVisible,
        published: t.published,
        published_in_window: t.publishedInWindow,
        interested_users: t.interestedUsers,
        median_remaining: t.medianRemaining,
        exhausted_users: t.exhaustedUsers,
        low_users: t.lowUsers,
      })),
      by_market: summary.byMarket.map((m) => ({
        market: m.market,
        users: m.users,
        signups_in_window: m.signupsInWindow,
        onboarding_completed: m.onboardingCompleted,
        active_7d: m.active7d,
        listeners_7d: m.listeners7d,
        listen_sec: m.listenSec,
        plays: m.plays,
        paid_active: m.paidActive,
      })),
    };
  }
}
