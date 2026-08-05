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
import { Topic } from '@/modules/interest/entities/topic.entity';

import { Content } from './content.entity';

/**
 * domain.md 5.2 — 콘텐츠 × 주제 다대다 조인 테이블.
 *
 * 명세서들은 `Content.topic_ids[]` 배열로 적고 있었으나 배열 컬럼으로는 인덱스가 제대로
 * 걸리지 않아 드립 후보 필터·탐색 주제 필터가 전체 스캔이 된다.
 */
@Entity('content_topics')
@Unique('uq_content_topics_content_id_topic_id', ['contentId', 'topicId'])
@Index('idx_content_topics_topic_id', ['topicId'])
export class ContentTopic extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_content_topics_contents',
  })
  content: Content;

  @Column({ name: 'topic_id', type: 'uuid' })
  topicId: string;

  @ManyToOne(() => Topic)
  @JoinColumn({
    name: 'topic_id',
    foreignKeyConstraintName: 'fk_content_topics_topics',
  })
  topic: Topic;
}
