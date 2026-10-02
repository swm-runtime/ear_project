import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { toServiceDayRange } from '@/common/utils/service-date.util';

/**
 * 일일 지표의 **서버 대조 값** — 가입 하나(`backend-monitoring.md` 3-3, 개정 2026-10-02).
 *
 * 보고의 숫자는 전부 GA4 다. 다만 GA4 `sign_up` 은 "가입"이 아니라 "온보딩 미완료 사용자의 로그인"이라
 * (`analytics.md` 3.4) 가입 뒤 온보딩을 미루고 다시 로그인하면 또 센다. 가입은 `POST /auth/sign-up` 을
 * 반드시 거치므로 서버 건수가 정확하다 — 둘이 다르면 문구가 괄호로 함께 적어 어긋남을 드러낸다.
 *
 * 완청은 대조하지 않는다 — GA4 `play_complete` 는 끝에 닿은 횟수이고 서버는 90% 를 처음 넘긴 콘텐츠
 * 수라, 정의가 달라 어긋나는 것이 정상이다. 탈퇴는 행을 삭제하므로(`domain.md` 12.3) 서버에 흔적이 없다.
 *
 * **날짜 경계는 서비스 날짜(04시)다** — 앱의 "하루" 정의와 같다(`service-date.util.ts`). GA4 의
 * 하루(KST 00시)와 4시간 어긋나며, 문구 각주가 그 사실을 적는다.
 */
@Injectable()
export class DailyMetricsDbService {
  constructor(private readonly dataSource: DataSource) {}

  /** `date`(YYYY-MM-DD) 서비스 날짜 하루의 가입 건수 */
  async fetchDaily(date: string): Promise<{ signUps: number }> {
    // 라벨 → 그 서비스 날짜 안의 한 시각(KST 04시)으로 만들어 유틸에 넘긴다 — 경계 계산은 유틸만 한다
    const { start, end } = toServiceDayRange(
      new Date(`${date}T04:00:00+09:00`),
    );
    const [row] = await this.dataSource.query<{ sign_ups: number }[]>(
      `select count(*)::int as sign_ups from users
        where created_at >= $1 and created_at < $2`,
      [start, end],
    );
    return { signUps: row?.sign_ups ?? 0 };
  }
}
