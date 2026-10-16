import { Column, Entity, PrimaryColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

/**
 * 서비스 날짜별 **재생 수·청취 시간·완청 수 누적**(domain.md 6.3-1, 2026-10-17) — 서비스 지표의 "누적 청취 시간"·"재생 수"·
 * "완청 수"가 읽는다.
 *
 * `play_records`를 바로 더하면 **탈퇴하면 숫자가 줄었다** — 탈퇴는 사용자 행과 함께 재생 기록을 지운다(domain.md 12.3).
 * 완청 신호(`user_signals`)는 탈퇴에 더해 **180일 보존 배치로도 지워진다**(domain.md 12.1). 그래서 원천을 쓸 때 **같은 트랜잭션에서
 * 이 표에도 더한다.** 사용자·콘텐츠를 가리키는 열이 없는 집계라 탈퇴해도
 * 지우지 않는다(개인정보가 아니다). 값은 더하기만 하고 빼지 않는다.
 *
 * - `play_count` — `play_records` 행이 **새로 생긴** 수(사용자 × 콘텐츠 × 서비스 날짜 1행 — 같은 날 다시 눌러도 늘지 않는다)
 * - `listen_sec` — `play_records.listened_sec`에 더한 값의 합. 날짜는 그 재생 행의 `play_date`(재생 시작일)다
 * - `complete_count` — 완청 신호(`user_signals.action = complete`)가 남은 수. 날짜는 신호가 남은 서비스 날짜다
 */
@Entity('play_daily_totals')
export class PlayDailyTotal extends BaseEntity {
  @PrimaryColumn({ name: 'play_date', type: 'date' })
  playDate: string;

  @Column({ name: 'play_count', type: 'int', default: 0 })
  playCount: number;

  /** bigint — 드라이버가 문자열로 돌려준다 */
  @Column({ name: 'listen_sec', type: 'bigint', default: 0 })
  listenSec: string;

  @Column({ name: 'complete_count', type: 'int', default: 0 })
  completeCount: number;
}
