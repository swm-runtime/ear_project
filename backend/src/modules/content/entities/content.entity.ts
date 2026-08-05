import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { ContentOrigin, ContentStatus } from '../content.enum';

/**
 * domain.md 5.1 — 단일 표준 에피소드. 같은 콘텐츠는 전 사용자에게 동일하며 변형은 없다.
 *
 * `partner_id`는 FK지만 `partners` 테이블이 아직 없으므로 **제약 없는 uuid 컬럼**으로 둔다.
 * partner 모듈을 만들 때 FK를 붙이는 마이그레이션을 추가한다.
 */
@Entity('contents')
@Index('idx_contents_status_published_at', ['status', 'publishedAt'])
@Index('idx_contents_series_id_episode_no', ['seriesId', 'episodeNo'])
@Index('idx_contents_partner_id', ['partnerId'])
export class Content extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text' })
  description: string;

  @Column({ name: 'author_name', type: 'varchar', length: 100 })
  authorName: string;

  /** 파트너명의 비정규화 사본. 발행 시점 값을 고정한다 (domain.md 5.1 — B-5) */
  @Column({ name: 'source_name', type: 'varchar', length: 100 })
  sourceName: string;

  @Column({ name: 'source_url', type: 'varchar', length: 2048 })
  sourceUrl: string;

  @Column({ name: 'origin', type: 'varchar', length: 20 })
  origin: ContentOrigin;

  @Column({ name: 'partner_id', type: 'uuid', nullable: true })
  partnerId: string | null;

  /** 분할되지 않은 단일 콘텐츠는 세 값이 모두 null이다 */
  @Column({ name: 'series_id', type: 'uuid', nullable: true })
  seriesId: string | null;

  @Column({ name: 'episode_no', type: 'int', nullable: true })
  episodeNo: number | null;

  @Column({ name: 'total_episodes', type: 'int', nullable: true })
  totalEpisodes: number | null;

  /**
   * **URL이 아니라 저장 경로다**(B-5). 재생 URL은 매 요청 서명 발급이므로 응답 DTO 필드이고,
   * 서명 URL을 DB에 저장하면 그 자체가 유출 경로가 된다(architecture.md 9.4).
   */
  @Column({ name: 'audio_path', type: 'varchar', length: 512 })
  audioPath: string;

  @Column({ name: 'duration_sec', type: 'int' })
  durationSec: number;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 2048 })
  thumbnailUrl: string;

  /** 재발행 시 같은 행의 값을 올린다. 새 행을 만들지 않으므로 참조가 유지된다 */
  @Column({ name: 'content_version', type: 'int', default: 1 })
  contentVersion: number;

  /** null = 기간 제한 없음 */
  @Column({ name: 'license_expires_at', type: 'timestamptz', nullable: true })
  licenseExpiresAt: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: ContentStatus;

  @Column({ name: 'published_at', type: 'timestamptz' })
  publishedAt: Date;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;
}
