import { InsightsListeningTotals, InsightsSummary } from '../admin.types';

/** 분모가 0 이면 null — 0% 와 "셀 수 없음"을 구분한다 */
export const ratio = (part: number, whole: number): number | null =>
  whole > 0 ? part / whole : null;

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
  }[];
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
      })),
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
    };
  }
}
