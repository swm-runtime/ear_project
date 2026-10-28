import { InsightsInviteCodeDetail } from '../admin.types';
import { ratio } from './admin-insights-summary-response.dto';

/**
 * `GET /admin/insights/invite-codes/:code`(2026-10-28 — 프로모션 탭 코드 상세). 집계값만 싣는다 — user_id·이름·이메일 없음.
 * 사람별 값은 중앙값·구간으로만 나간다
 */
export class AdminInviteCodeDetailResponseDto {
  readonly days: number;
  readonly since: string;
  readonly generated_at: string;
  readonly code: string;
  readonly name: string;
  /** 창 안 청취 시간 중앙값(초) — 1인당 평균 옆에 둔다 */
  readonly median_listen_sec: number;
  /** 창 안 청취량 구간별 인원 */
  readonly listen_buckets: {
    none: number;
    under_10m: number;
    under_60m: number;
    over_60m: number;
  };
  /** 입력 전 7일 vs 입력 뒤(오늘까지) — 1인 1일당 청취 초 · 접속한 날 비율 */
  readonly before_after: {
    before_listen_sec_per_day: number | null;
    after_listen_sec_per_day: number | null;
    before_active_day_rate: number | null;
    after_active_day_rate: number | null;
  };
  /** 입력한 서비스 날짜 = 0일째. 그날이 다 지난 사람만 분모 */
  readonly retention: {
    day: number;
    eligible: number;
    returned: number;
    rate: number | null;
  }[];
  readonly daily: {
    date: string;
    active: number;
    listeners: number;
    listen_sec: number;
    plays: number;
  }[];
  /** 창 안 완청률 — 묶음과 기준선(코드 없는 사용자) */
  readonly completion: {
    plays: number;
    completes: number;
    complete_rate: number | null;
    baseline_complete_rate: number | null;
  };
  readonly top_contents: {
    title: string;
    listeners: number;
    plays: number;
    listen_sec: number;
  }[];
  /** 지급이 끝난 사람 · 그중 입력 뒤 실결제를 시작한 사람 */
  readonly conversion: {
    ended: number;
    paid: number;
    rate: number | null;
  };

  static from(
    result: { since: Date; detail: InsightsInviteCodeDetail },
    days: number,
    now: Date,
  ): AdminInviteCodeDetailResponseDto {
    const d = result.detail;

    return {
      days,
      since: result.since.toISOString(),
      generated_at: now.toISOString(),
      code: d.code,
      name: d.name,
      median_listen_sec: d.medianListenSec,
      listen_buckets: {
        none: d.listenBuckets.none,
        under_10m: d.listenBuckets.under10m,
        under_60m: d.listenBuckets.under60m,
        over_60m: d.listenBuckets.over60m,
      },
      before_after: {
        before_listen_sec_per_day: d.beforeAfter.beforeListenSecPerDay,
        after_listen_sec_per_day: d.beforeAfter.afterListenSecPerDay,
        before_active_day_rate: d.beforeAfter.beforeActiveDayRate,
        after_active_day_rate: d.beforeAfter.afterActiveDayRate,
      },
      retention: d.retention.map((r) => ({
        day: r.day,
        eligible: r.eligible,
        returned: r.returned,
        rate: ratio(r.returned, r.eligible),
      })),
      daily: d.daily.map((row) => ({
        date: row.date,
        active: row.active,
        listeners: row.listeners,
        listen_sec: row.listenSec,
        plays: row.plays,
      })),
      completion: {
        plays: d.completion.plays,
        completes: d.completion.completes,
        complete_rate: ratio(d.completion.completes, d.completion.plays),
        baseline_complete_rate: ratio(
          d.completion.baselineCompletes,
          d.completion.baselinePlays,
        ),
      },
      top_contents: d.topContents.map((t) => ({
        title: t.title,
        listeners: t.listeners,
        plays: t.plays,
        listen_sec: t.listenSec,
      })),
      conversion: {
        ended: d.conversion.ended,
        paid: d.conversion.paidAfterEnd,
        rate: ratio(d.conversion.paidAfterEnd, d.conversion.ended),
      },
    };
  }
}
