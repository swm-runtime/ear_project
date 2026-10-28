import {
  InsightsInviteCodeBaseline,
  InsightsInviteCodeCohort,
} from '../admin.types';
import { ratio } from './admin-insights-summary-response.dto';

interface CohortMetrics {
  current: number;
  active_7d: number;
  listeners_7d: number;
  /** 창 안 청취 시간 합(초) */
  listen_sec: number;
  /** `listen_sec / current` — 계정 1명당 창 안 청취 시간 */
  listen_sec_per_user: number | null;
  /** `active_7d / current` */
  active_7d_rate: number | null;
}

const toMetrics = (
  row: Pick<
    InsightsInviteCodeCohort,
    'current' | 'active7d' | 'listeners7d' | 'listenSec'
  >,
): CohortMetrics => ({
  current: row.current,
  active_7d: row.active7d,
  listeners_7d: row.listeners7d,
  listen_sec: row.listenSec,
  listen_sec_per_user: ratio(row.listenSec, row.current),
  active_7d_rate: ratio(row.active7d, row.current),
});

/**
 * `GET /admin/insights/invite-codes`(2026-10-28 — 로그 콘솔 "프로모션" 탭). 초대 코드(프로모션)마다 입력한 현재 계정의 활성·청취·결제와,
 * 코드를 입력한 적 없는 현재 계정의 같은 값(기준선). 집계값만 싣는다 — 이름·이메일·user_id 없음
 */
export class AdminInviteCodeCohortsResponseDto {
  readonly days: number;
  readonly since: string;
  readonly generated_at: string;
  readonly codes: (CohortMetrics & {
    code: string;
    name: string;
    tier: string;
    grant_days: number | null;
    grant_until_date: string | null;
    is_active: boolean;
    /** 지금까지 입력한 계정 수(탈퇴해도 줄지 않는다) */
    redeemed: number;
    /** `redeemed - current` — 입력한 뒤 탈퇴한 계정 */
    withdrawn: number;
    active_grants: number;
    ended_grants: number;
    /** 코드를 입력한 뒤 실결제를 시작한 계정 */
    paid_after_start: number;
    /** `paid_after_start / current` */
    paid_after_start_rate: number | null;
  })[];
  readonly baseline: CohortMetrics & {
    /** 실결제를 한 번이라도 한 계정 */
    paid_ever: number;
    /** `paid_ever / current` */
    paid_ever_rate: number | null;
  };

  static from(
    result: {
      since: Date;
      codes: InsightsInviteCodeCohort[];
      baseline: InsightsInviteCodeBaseline;
    },
    days: number,
    now: Date,
  ): AdminInviteCodeCohortsResponseDto {
    return {
      days,
      since: result.since.toISOString(),
      generated_at: now.toISOString(),
      codes: result.codes.map((row) => ({
        ...toMetrics(row),
        code: row.code,
        name: row.name,
        tier: row.tier,
        grant_days: row.grantDays,
        grant_until_date: row.grantUntilDate,
        is_active: row.isActive,
        redeemed: row.redeemed,
        withdrawn: Math.max(0, row.redeemed - row.current),
        active_grants: row.activeGrants,
        ended_grants: row.endedGrants,
        paid_after_start: row.paidAfterStart,
        paid_after_start_rate: ratio(row.paidAfterStart, row.current),
      })),
      baseline: {
        ...toMetrics(result.baseline),
        paid_ever: result.baseline.paidEver,
        paid_ever_rate: ratio(
          result.baseline.paidEver,
          result.baseline.current,
        ),
      },
    };
  }
}
