import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/user/entities/user.entity';

import { DurationPref } from '../drip.types';

/**
 * domain.md 7.2 — `user_signals`를 집계한 **파생 캐시**다. 원천은 `user_signals`이며,
 * 편성 배치 시점에만 재계산한다(실시간 없음 — `drip-scheduling.md` 4.3). 탐색 피드
 * 랭킹(조회 시점 계산)도 이 캐시를 읽는다.
 *
 * `taste_embedding`(취향 벡터)은 **아직 없다** — 임베딩 모델·차원 미확정 상태에서는
 * 벡터 컬럼 마이그레이션을 만들지 않는다(domain.md 15.1 #11). 모델 확정 시 컬럼을
 * 추가한다(`tickets/backend/pending/metadata-pipeline-after-script-quality.md`).
 */
@Entity('user_preference_vectors')
@Unique('uq_user_preference_vectors_user_id', ['userId'])
export class UserPreferenceVector extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_user_preference_vectors_users',
  })
  user: User;

  /** { topic_id: float } — 음수는 부정 신호 회피 감점의 근거다(`drip-scheduling.md` 4.2 ②) */
  @Column({ name: 'topic_weights', type: 'jsonb', default: () => "'{}'" })
  topicWeights: Record<string, number>;

  @Column({ name: 'author_weights', type: 'jsonb', default: () => "'{}'" })
  authorWeights: Record<string, number>;

  /** { keyword: float } — `contents.keywords` 기반 (확장 2026-08-26) */
  @Column({ name: 'keyword_weights', type: 'jsonb', default: () => "'{}'" })
  keywordWeights: Record<string, number>;

  /** { format: float } — `contents.format` 기반 (확장 2026-08-26) */
  @Column({ name: 'format_weights', type: 'jsonb', default: () => "'{}'" })
  formatWeights: Record<string, number>;

  /** 완청 길이 분포 — 완청 신호가 하나도 없으면 null (확장 2026-08-26) */
  @Column({ name: 'duration_pref', type: 'jsonb', nullable: true })
  durationPref: DurationPref | null;

  /** 콜드스타트 판정용 — **완청 신호 수**다(domain.md 7.2, 기준값 3건) */
  @Column({ name: 'signal_count', type: 'int', default: 0 })
  signalCount: number;
}
