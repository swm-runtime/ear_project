import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/user/entities/user.entity';

/**
 * 사용자가 앱을 연 **KST 달력일**(domain.md 3.3-2 신설 요청 — `changes/archive/insights-retention-cohorts.md`, 2026-10-18 · 반영 2026-10-19).
 * 서비스 지표의 코호트 리텐션(D1·D7·W1~W4)이 읽는다.
 *
 * "앱을 열었다"는 `daily_active_users`와 같은 신호다 — 그날 `sessions.issued_at`이 하나라도 있으면 한 행. 세션 행은 30일 뒤
 * 지워지지만(domain.md 12.1) W4는 가입 28~34일 뒤를 보므로, 날이 끝나면 사람·날짜 한 쌍만 여기 남긴다(`DailyActiveUserScheduler`).
 * 행이 있다/없다만 뜻이 있어 값 열이 없다.
 *
 * 사람을 가리키는 열이 있어 **탈퇴하면 함께 지운다**(FK ON DELETE CASCADE — 12.3 즉시 파기). PK 가 자연키 `(user_id, active_date)`다.
 */
@Entity('user_active_dates')
export class UserActiveDate extends BaseEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_user_active_dates_users',
  })
  user: User;

  /** KST 달력일(`YYYY-MM-DD`) — 서비스 날짜(05:00 경계)가 아니다. 서비스 지표의 다른 일별 값과 같은 단위 */
  @PrimaryColumn({ name: 'active_date', type: 'date' })
  activeDate: string;
}
