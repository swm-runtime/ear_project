import { Column, Entity, PrimaryColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { UserMarket } from '@/modules/user/user.enum';

/**
 * KST 달력일·시장별 **접속자 수**(domain.md 3.3-1 신설 요청 — `changes/pending/insights-daily-active-users.md`, 2026-10-18).
 * 서비스 지표의 일별 접속자·요일별 평균이 읽는다.
 *
 * "접속자"는 그날(KST 00:00~24:00) `sessions.issued_at`이 하나라도 있는 사용자다 — 서비스 지표의 `active_1d/7d/30d`와 같은 신호다
 * (액세스 토큰이 30분이라 앱을 열면 거의 매번 리프레시 회전으로 세션 행이 생긴다). **세션 행은 만료·폐기 30일 뒤 지워지므로**
 * (`SessionPurgeScheduler`, domain.md 12.1) 지난날은 원천에서 다시 셀 수 없다. 그래서 매일 세어 이 표에 남긴다 — `play_daily_totals`와
 * 같은 이유로 **이 표가 곧 원천**이다(파생값을 두지 않는다는 규약의 예외).
 *
 * 사용자를 가리키는 열이 없는 집계라 탈퇴해도 지우지 않고, 보존 기한도 없다.
 * PK 가 `id`가 아니라 자연키 `(active_date, market)`다 — 날짜·시장당 한 행이고 upsert 대상이다.
 */
@Entity('daily_active_users')
export class DailyActiveUser extends BaseEntity {
  /** KST 달력일(`YYYY-MM-DD`) — 서비스 날짜(05:00 경계)가 아니다. 서비스 지표의 다른 일별 값과 같은 단위 */
  @PrimaryColumn({ name: 'active_date', type: 'date' })
  activeDate: string;

  /** 그 사용자의 `users.market` — 접속자가 없는 날도 0 행을 둔다(행 없음 = 기록 없음과 구분) */
  @PrimaryColumn({ name: 'market', type: 'varchar', length: 10 })
  market: UserMarket;

  @Column({ name: 'active_users', type: 'int', default: 0 })
  activeUsers: number;
}
