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
import { UserMarket } from '@/modules/user/user.enum';

/**
 * 콘텐츠 후기 — domain.md 6.8 (KAN-279, `content-review.md`). **편 자체의 평가다.**
 *
 * 추천 별점(`drip_feedbacks`)과 표·집계·팝업을 모두 따로 두고, **추천 입력이 아니다** — 편성·탐색 랭킹·선호 벡터 어느 것도
 * 이 표를 읽지 않는다. `(user_id, content_id)`당 한 행이고 다시 보내면 그 시점 값으로 덮어쓴다(upsert).
 * 글 원문은 이 표와 관리자 API에만 있다 — 로그에 남기지 않는다(convention.md 8.4).
 */
@Entity('content_reviews')
// upsert 의 충돌 대상이다 — 선언이 빠지면 `migration:generate`가 DROP 을 만든다
@Unique('uq_content_reviews_user_id_content_id', ['userId', 'contentId'])
// `updated_at DESC, id DESC` 방향은 TypeORM `@Index`가 표현하지 못해 마이그레이션 SQL이 정확한 정의를 갖는다
@Index('idx_content_reviews_content_id_updated_at', [
  'contentId',
  'updatedAt',
  'id',
])
@Index('idx_content_reviews_updated_at', ['updatedAt', 'id'])
export class ContentReview extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_content_reviews_users',
  })
  user: User;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_content_reviews_contents',
  })
  content: Content;

  /** 1~5 (CHECK) */
  @Column({ name: 'stars', type: 'smallint' })
  stars: number;

  /** 앞뒤 공백을 뺀 글(코드 포인트 500자 이하). 빈 값은 NULL — 글 없음 */
  @Column({ name: 'text', type: 'varchar', length: 500, nullable: true })
  text: string | null;

  /** 후기를 쓴(고친) 시점에 끝까지 들었는가 — 서버가 저장 시점에 판정한다(완청의 공용 정의) */
  @Column({ name: 'is_completed', type: 'boolean' })
  isCompleted: boolean;

  /** 후기를 쓴(고친) 시점의 `contents.content_version` — 재합성 전후 후기를 가른다 */
  @Column({ name: 'content_version', type: 'int' })
  contentVersion: number;

  /** 후기를 쓴(고친) 시점의 `users.market` — 관리자 글 목록의 "시장" */
  @Column({ name: 'market', type: 'varchar', length: 20 })
  market: UserMarket;
}
