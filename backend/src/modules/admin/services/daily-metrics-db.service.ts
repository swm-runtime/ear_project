import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { toServiceDayRange } from '@/common/utils/service-date.util';
import { UserMarket } from '@/modules/user/user.enum';

/**
 * 일일 보고의 **서버 값**(`backend-monitoring.md` 3-3).
 *
 * - **가입자**(지표 보고) — 현재 가입자 수와 어제 가입 건수(2026-10-13). GA4 `sign_up` 은 "가입"이 아니라
 *   "온보딩 미완료 사용자의 로그인"이라(`analytics.md` 3.4) 가입 뒤 온보딩을 미루고 다시 로그인하면 또 센다.
 *   가입은 `POST /auth/sign-up` 을 반드시 거치므로 서버 건수가 정확하다. 현재 가입자 수는 `users` 행 수다 —
 *   탈퇴는 행을 지우므로 필터가 필요 없다(`admin-api.md` 의 `current` 와 같은 정의).
 * - **시장별**(2026-10-17 — 글로벌 출시 대비) — 가입자를 `users.market`으로 나누고, 보고일 서비스 날짜의 **서버 청취**
 *   (`play_records` — 청취자·재생·청취 시간)를 시장별로 센다. GA4 이벤트에는 시장이 없어 서버 값으로만 가른다. 탈퇴는
 *   `withdrawal_logs`에 시장이 없어 나누지 않는다.
 * - **탈퇴**(이탈 보고, 2026-10-15) — `withdrawal_logs` 의 사유 코드별 건수. 건마다 오던 탈퇴 알림을 대신한다.
 *   사용자 행은 지워져도 이 로그는 남는다(`domain.md` 3.4). 직접 입력 사유 원문은 가져오지 않는다 — 분포만 본다.
 *
 * 완청은 대조하지 않는다 — GA4 `play_complete` 는 끝에 닿은 횟수이고 서버는 90% 를 처음 넘긴 콘텐츠
 * 수라, 정의가 달라 어긋나는 것이 정상이다.
 *
 * **날짜 경계는 서비스 날짜(04시, 전환 뒤 05시 — `domain.md` 1.2)다** — 앱의 "하루" 정의와 같다
 * (`service-date.util.ts`). 가입과 탈퇴가 같은 범위를 쓴다. GA4 의 하루(KST 00시)와 어긋나며, 문구 각주가 그 사실을 적는다.
 */
export type DailyServerMetrics = {
  signUps: number;
  totalUsers: number;
  /** 사유 코드별 탈퇴 건수 — `reasonCode` null 은 사유를 고르지 않은 탈퇴. 0건인 사유는 행이 없다 */
  withdrawals: WithdrawalCount[];
  /** 시장마다 한 칸(`UserMarket` 순서) — 계정이 없는 시장도 0 으로 채운다. "0명"과 "집계 누락"을 가르기 위해서다 */
  markets: MarketDaily[];
};

export type MarketDaily = {
  market: UserMarket;
  totalUsers: number;
  signUps: number;
  /** 보고일 서비스 날짜에 재생한 사람 수 — 지금 계정 기준(그 뒤 탈퇴한 사람은 빠진다) */
  listeners: number;
  /** 재생 기록 수 — 사용자 × 콘텐츠 × 서비스 날짜 1건(같은 날 다시 들어도 1) */
  plays: number;
  /** 재생 시작일이 보고일인 재생의 실제 청취 초 */
  listenSec: number;
};

export type WithdrawalCount = { reasonCode: string | null; count: number };

@Injectable()
export class DailyMetricsDbService {
  constructor(private readonly dataSource: DataSource) {}

  /** `date`(YYYY-MM-DD) 서비스 날짜 하루의 가입·탈퇴 건수와, 조회 시각의 전체 가입자 수 */
  async fetchDaily(date: string): Promise<DailyServerMetrics> {
    // 라벨 → 그 서비스 날짜 안의 한 시각(KST 정오 — 04시·05시 어느 경계에서도 그날 안이다)으로 만들어
    // 유틸에 넘긴다. 경계 계산은 유틸만 한다
    const { start, end } = toServiceDayRange(
      new Date(`${date}T12:00:00+09:00`),
    );
    const [members, withdrawals, listening] = await Promise.all([
      // 시장마다 한 번에 센다 — 표 하나를 두 번 훑을 이유가 없다
      this.dataSource.query<
        { market: UserMarket; sign_ups: number; total_users: number }[]
      >(
        `select market,
                count(*) filter (where created_at >= $1 and created_at < $2)::int as sign_ups,
                count(*)::int as total_users
           from users
          group by market`,
        [start, end],
      ),
      this.dataSource.query<{ reason_code: string | null; count: number }[]>(
        `select reason_code, count(*)::int as count
           from withdrawal_logs
          where withdrawn_at >= $1 and withdrawn_at < $2
          group by reason_code`,
        [start, end],
      ),
      // 재생 행의 서비스 날짜(`play_date`)로 자른다 — 경계를 넘겨 들어도 시작일에 쌓이는 청취 시간과 같은 기준이다
      this.dataSource.query<
        {
          market: UserMarket;
          listeners: number;
          plays: number;
          listen_sec: number;
        }[]
      >(
        `select u.market,
                count(distinct p.user_id)::int as listeners,
                count(*)::int as plays,
                coalesce(sum(p.listened_sec), 0)::float8 as listen_sec
           from play_records p
           join users u on u.id = p.user_id
          where p.play_date = $1
          group by u.market`,
        [date],
      ),
    ]);
    const memberRows = new Map(members.map((r) => [r.market, r]));
    const listeningRows = new Map(listening.map((r) => [r.market, r]));
    const markets = Object.values(UserMarket).map((market) => ({
      market,
      totalUsers: memberRows.get(market)?.total_users ?? 0,
      signUps: memberRows.get(market)?.sign_ups ?? 0,
      listeners: listeningRows.get(market)?.listeners ?? 0,
      plays: listeningRows.get(market)?.plays ?? 0,
      listenSec: listeningRows.get(market)?.listen_sec ?? 0,
    }));
    return {
      signUps: markets.reduce((sum, m) => sum + m.signUps, 0),
      totalUsers: markets.reduce((sum, m) => sum + m.totalUsers, 0),
      markets,
      withdrawals: withdrawals.map((r) => ({
        reasonCode: r.reason_code,
        count: r.count,
      })),
    };
  }
}
