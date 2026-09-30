import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { User } from '@/modules/user/entities/user.entity';

/**
 * 사용자가 편성분(드립·탐험)에 매긴 별점 — domain.md 6.7 (KAN-116, `drip-feedback.md`).
 *
 * **추천 입력이 아니다.** `user_signals`와 달리 스코어링이 읽지 않는다 — 알고리즘 버전별 평점을 재는 측정값이다
 * (반영하면 "평점이 오른 게 알고리즘 덕인지 반영 덕인지" 구분이 안 된다). `(user_id, content_id)` 유니크 — 같은
 * 콘텐츠의 재전송은 덮어쓴다.
 */
@Entity('drip_feedbacks')
export class DripFeedback extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_drip_feedbacks_users',
  })
  user: User;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_drip_feedbacks_contents',
  })
  content: Content;

  /** 편성 경로(`library_items.source` — drip | discovery). 탐험 편의 평점을 따로 볼 수 있게 남긴다 */
  @Column({ name: 'source', type: 'varchar', length: 20 })
  source: LibraryItemSource;

  /** 편성 시점의 `library_items.algorithm_version`. 버전 도입 전 편성분은 NULL */
  @Column({
    name: 'algorithm_version',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  algorithmVersion: string | null;

  /** 편성된 서비스 날짜 라벨(`YYYY-MM-DD`) — 어드민이 날짜별로도 볼 수 있게 */
  @Column({ name: 'placed_date', type: 'date' })
  placedDate: string;

  /** 1~5 */
  @Column({ name: 'stars', type: 'smallint' })
  stars: number;
}
