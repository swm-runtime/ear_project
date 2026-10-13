import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { toServiceDayRange } from '@/common/utils/service-date.util';

/**
 * 일일 지표의 **서버 값** — 현재 가입자 수와 어제 가입 건수(`backend-monitoring.md` 3-3, 개정 2026-10-13).
 *
 * 나머지 숫자는 전부 GA4 다. 다만 GA4 `sign_up` 은 "가입"이 아니라 "온보딩 미완료 사용자의 로그인"이라
 * (`analytics.md` 3.4) 가입 뒤 온보딩을 미루고 다시 로그인하면 또 센다. 가입은 `POST /auth/sign-up` 을
 * 반드시 거치므로 서버 건수가 정확하다 — 건마다 오던 가입 알림을 없애고 이 줄로 대신한다(2026-10-13).
 * 현재 가입자 수는 `users` 행 수다 — 탈퇴는 행을 지우므로 필터가 필요 없다(`admin-api.md` 의 `current` 와 같은 정의).
 *
 * 완청은 대조하지 않는다 — GA4 `play_complete` 는 끝에 닿은 횟수이고 서버는 90% 를 처음 넘긴 콘텐츠
 * 수라, 정의가 달라 어긋나는 것이 정상이다. 탈퇴는 행을 삭제하므로(`domain.md` 12.3) 서버에 흔적이 없다.
 *
 * **날짜 경계는 서비스 날짜(04시, 전환 뒤 05시 — `domain.md` 1.2)다** — 앱의 "하루" 정의와 같다
 * (`service-date.util.ts`). GA4 의 하루(KST 00시)와 어긋나며, 문구 각주가 그 사실을 적는다.
 */
@Injectable()
export class DailyMetricsDbService {
  constructor(private readonly dataSource: DataSource) {}

  /** `date`(YYYY-MM-DD) 서비스 날짜 하루의 가입 건수와, 조회 시각의 전체 가입자 수 */
  async fetchDaily(
    date: string,
  ): Promise<{ signUps: number; totalUsers: number }> {
    // 라벨 → 그 서비스 날짜 안의 한 시각(KST 정오 — 04시·05시 어느 경계에서도 그날 안이다)으로 만들어
    // 유틸에 넘긴다. 경계 계산은 유틸만 한다
    const { start, end } = toServiceDayRange(
      new Date(`${date}T12:00:00+09:00`),
    );
    // 한 번에 센다 — 표 하나를 두 번 훑을 이유가 없다
    const [row] = await this.dataSource.query<
      { sign_ups: number; total_users: number }[]
    >(
      `select count(*) filter (where created_at >= $1 and created_at < $2)::int as sign_ups,
              count(*)::int as total_users
         from users`,
      [start, end],
    );
    return { signUps: row?.sign_ups ?? 0, totalUsers: row?.total_users ?? 0 };
  }
}
