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

import { Content } from './content.entity';
import { StatsPeriodType } from '../content.enum';

/**
 * domain.md 5.4 — 구간별 콘텐츠 집계.
 *
 * **테이블 소유는 content 모듈이지만 집계 배치는 `playback` 모듈이 실행한다**(domain.md 2장).
 * 집계 원천(`play_records` · `user_signals`)을 그 모듈이 소유하기 때문이다.
 * 온보딩은 이 테이블을 **읽기만** 한다.
 *
 * `complete_rate`를 저장하지 않는다 — 비율은 합산이 불가능해 상위 구간에서 조용히 틀린다.
 */
@Entity('content_stats')
@Unique('uq_content_stats_content_id_period_type_period_start', [
  'contentId',
  'periodType',
  'periodStart',
])
@Index('idx_content_stats_period_type_period_start_play_count', [
  'periodType',
  'periodStart',
  'playCount',
])
export class ContentStat extends BaseEntity {
  /** 대량 로그성 테이블이라 bigserial이다 (domain.md 1.1 예외 조항) */
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_content_stats_contents',
  })
  content: Content;

  @Column({ name: 'period_type', type: 'varchar', length: 10 })
  periodType: StatsPeriodType;

  /** week = 그 주 월요일, month = 그 달 1일, all = `1970-01-01` 고정 */
  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'play_count', type: 'int', default: 0 })
  playCount: number;

  @Column({ name: 'complete_count', type: 'int', default: 0 })
  completeCount: number;

  /** `play_records.listened_sec`의 합계. 파트너 정산 근거다 (FR-34) */
  @Column({ name: 'total_listen_sec', type: 'bigint', default: 0 })
  totalListenSec: string;

  @Column({ name: 'save_count', type: 'int', default: 0 })
  saveCount: number;

  @Column({ name: 'source_link_click_count', type: 'int', default: 0 })
  sourceLinkClickCount: number;

  /** 구간이 끝나면 잠근다. **순위·정산은 `is_final = true` 행만 읽는다** */
  @Column({ name: 'is_final', type: 'boolean', default: false })
  isFinal: boolean;
}
