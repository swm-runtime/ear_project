import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { User } from '@/modules/user/entities/user.entity';

/**
 * domain.md 6.6 — [원문 보기] 탭 **1회 = 1행**이다(`player.md` 4.5).
 * `content_stats.source_link_click_count`의 유일한 원천이다(합의 2026-08-06).
 *
 * **`user_signals`에 action을 추가하지 않은 이유** — 그 테이블은 추천 스코어링 입력
 * 전용인데(A-7) 원문 클릭은 스코어링에 쓰이지 않는다. `seek`·`rate_change`를 뺀 것과 같은
 * 기준을 지키면서 목적이 다른 행만 별도로 담는다.
 *
 * **구조화 로그로 보낼 수도 없다.** 파트너 리포팅 지표라 원천 로그와 집계값이 재현
 * 가능해야 하고(`partner-control.md` 4.6), 그러려면 원천이 DB 테이블이어야 한다.
 *
 * 클릭 시각은 별도 컬럼 없이 `created_at`이다 — 행 생성이 곧 클릭이다.
 */
@Entity('source_link_clicks')
@Index('idx_source_link_clicks_content_id_created_at', [
  'contentId',
  'createdAt',
])
@Index('idx_source_link_clicks_user_id', ['userId'])
export class SourceLinkClick extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** 중복 클릭 분석·탈퇴 파기 경로용. 집계는 개인 식별 없이 카운트만 쓴다(domain.md 6.6) */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_source_link_clicks_users',
  })
  user: User;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content)
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_source_link_clicks_contents',
  })
  content: Content;
}
