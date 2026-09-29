import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { toServiceDayRange } from '@/common/utils/service-date.util';

/**
 * 일일 지표 중 **서버가 진실인 값** — 가입과 완청.
 *
 * GA4 는 그 이벤트가 실린 빌드(runtime 7 이후)에서만 들어오고, 스토어 1.0.0 사용자는 잡히지
 * 않는다. 가입은 `POST /auth/sign-up` 을 반드시 거치고 완청은 서버가 판정한다(`player.md` 4.4 →
 * `library_items.status = completed`). 그래서 이 둘은 앱 버전과 무관하게 정확한 서버 값을 쓴다.
 *
 * 탈퇴는 세지 않는다 — 탈퇴는 행을 삭제하므로(`domain.md` 12.3) 서버에 흔적이 없다. GA4
 * `withdrawal` 이벤트로 본다.
 *
 * **날짜 경계는 서비스 날짜(04시)다** — 앱의 "하루" 정의와 같다(`service-date.util.ts`). GA4 의
 * 하루(KST 00시)와 4시간 어긋나는데, 서버 값을 GA4 에 맞추면 앱이 말하는 "오늘 가입"과 달라진다.
 * 문구에 그 사실을 적는다.
 */
@Injectable()
export class DailyMetricsDbService {
  constructor(private readonly dataSource: DataSource) {}

  /** `date`(YYYY-MM-DD) 서비스 날짜 하루의 가입·완청 건수 */
  async fetchDaily(
    date: string,
  ): Promise<{ signUps: number; completes: number }> {
    // 라벨 → 그 서비스 날짜 안의 한 시각(KST 04시)으로 만들어 유틸에 넘긴다 — 경계 계산은 유틸만 한다
    const { start, end } = toServiceDayRange(
      new Date(`${date}T04:00:00+09:00`),
    );
    const [row] = await this.dataSource.query<
      { sign_ups: number; completes: number }[]
    >(
      `select
         (select count(*)::int from users
           where created_at >= $1 and created_at < $2) as sign_ups,
         (select count(*)::int from library_items
           where status = 'completed' and completed_at >= $1 and completed_at < $2) as completes`,
      [start, end],
    );
    return { signUps: row?.sign_ups ?? 0, completes: row?.completes ?? 0 };
  }
}
