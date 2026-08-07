import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { User } from '@/modules/user/entities/user.entity';

/**
 * domain.md 6.3 — **페이월 카운트의 유일한 근거다**(A-2).
 *
 * `daily_play_count`는 컬럼이 아니라 이 테이블의 집계다(domain.md 1.5).
 * `users.daily_play_count` · `count_reset_at`은 폐기된 개체이며, 04시 리셋 배치도 돌리지
 * 않는다 — 판정 시점에 서비스 날짜로 세는 방식이라 배치 지연·시간대 이슈가 판정에
 * 영향을 주지 않는다(`paywall.md` 4.4).
 *
 * `play_date`가 유니크 키에 포함되므로 **같은 날 같은 콘텐츠를 다시 재생해도 카운트가
 * 늘지 않는 것을 DB가 보장한다**(`paywall.md` 4.3). 애플리케이션이 중복을 신경 쓰지 않는다.
 *
 * PK가 `bigserial`인 것은 대량 로그성 테이블이기 때문이다(convention.md 4.2 예외 조항).
 */
@Entity('play_records')
@Unique('uq_play_records_user_id_content_id_play_date', [
  'userId',
  'contentId',
  'playDate',
])
@Index('idx_play_records_user_id_play_date', ['userId', 'playDate'])
@Index('idx_play_records_content_id_play_date', ['contentId', 'playDate'])
export class PlayRecord extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_play_records_users',
  })
  user: User;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content)
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_play_records_contents',
  })
  content: Content;

  /**
   * **04시 기준 서비스 날짜**(domain.md 1.2). 자정 경계가 아니다.
   * 시각이 아니라 `date`인 이유는 이 값이 판정·집계의 축이기 때문이다.
   */
  @Column({ name: 'play_date', type: 'date' })
  playDate: string;

  @Column({ name: 'played_at', type: 'timestamptz' })
  playedAt: Date;

  /**
   * 실제 청취 시간 누적(FR-34). 도달 위치가 아니라 **재생기가 실제로 소리를 낸 시간**이다 —
   * 2배속으로 10분짜리를 끝까지 들으면 `max_reached_sec = 600`이지만 이 값은 약 300이다.
   *
   * 갱신은 재생 종료 이벤트를 소유한 `player` 쪽 책임이며, 이 모듈의 재생 시작 경로는
   * 행을 만들기만 하고 0으로 둔다.
   */
  @Column({ name: 'listened_sec', type: 'int', default: 0 })
  listenedSec: number;
}
