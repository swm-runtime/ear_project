import {
  InsightsDripArrivalTime,
  InsightsDripArrivalTimeKey,
} from '../admin.types';

/** 묶음 한 행 — 비율은 보낸 알림 0이면 null */
export interface AdminDripArrivalTimeArmDto {
  key: InsightsDripArrivalTimeKey;
  send_time: string;
  /** true = 참고 행(아침 알림 — A/B 비교 아님) */
  reference: boolean;
  sent: number;
  users: number;
  played_2h: number;
  played_same_day: number;
  play_rate_2h: number | null;
  play_rate_same_day: number | null;
  first_sent_at: string | null;
  last_sent_at: string | null;
}

/**
 * `GET /admin/insights/drip-arrival-time` — 도착 알림 시각 실험(KAN-289, 2026-10-30). 집계뿐이다 — 사용자는 수로만 들어
 * 있고 `user_id`·이름·이메일은 없다(`experiments-api.md` 4.6). 클릭률(`opened_at`)은 기록되지 않아 싣지 않는다.
 */
export class AdminInsightsDripArrivalTimeResponseDto {
  readonly generated_at: string;
  readonly market: string | null;
  readonly days: number;
  readonly since: string;
  /** 보낸 알림이 이보다 적은 행은 "표본 작음" */
  readonly min_sample: number;
  readonly reaction_window_hours: number;
  /** baseline · a · b · morning 순서로 늘 네 행 */
  readonly arms: AdminDripArrivalTimeArmDto[];

  static from(
    v: InsightsDripArrivalTime,
    options: { minSample: number; reactionWindowHours: number },
  ): AdminInsightsDripArrivalTimeResponseDto {
    return {
      generated_at: v.generatedAt.toISOString(),
      market: v.market,
      days: v.days,
      since: v.since.toISOString(),
      min_sample: options.minSample,
      reaction_window_hours: options.reactionWindowHours,
      arms: v.arms.map((a) => ({
        key: a.key,
        send_time: a.sendTime,
        reference: a.reference,
        sent: a.sent,
        users: a.users,
        played_2h: a.played2h,
        played_same_day: a.playedSameDay,
        play_rate_2h: a.playRate2h,
        play_rate_same_day: a.playRateSameDay,
        first_sent_at: a.firstSentAt?.toISOString() ?? null,
        last_sent_at: a.lastSentAt?.toISOString() ?? null,
      })),
    };
  }
}
