import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { AudioQuality } from '../content.enum';
import { Content } from './content.entity';

/**
 * domain.md 5.8 — 콘텐츠 하나의 음질별 오디오 파일(KAN-141). `compressed` 행은 항상 있고 그 `path`는
 * `contents.audio_path`와 같다. 메타(코덱·비트레이트 등)는 업로드 때 서버가 파일에서 읽어 채운다 —
 * 수동 입력을 받지 않는다. `path`는 어떤 응답에도 실리지 않는다(서명 URL 경로에만).
 */
@Entity({ name: 'content_audio_renditions' })
@Unique('uq_content_audio_renditions_content_id_quality', [
  'contentId',
  'quality',
])
export class ContentAudioRendition extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'content_id',
    // 마이그레이션(`AddAudioQualityTiers`)이 만든 이름 — 선언이 없으면 `migration:generate`가 FK를 다시 만들려 한다
    foreignKeyConstraintName: 'fk_content_audio_renditions_content_id',
  })
  content: Content;

  @Column({ name: 'quality', type: 'varchar', length: 20 })
  quality: AudioQuality;

  @Column({ name: 'path', type: 'varchar', length: 512 })
  path: string;

  /** mp3 | aac | pcm_s16le — 표시·진단용 */
  @Column({ name: 'codec', type: 'varchar', length: 16 })
  codec: string;

  /** NULL = 무손실이거나 모름(백필 행) */
  @Column({ name: 'bitrate_kbps', type: 'int', nullable: true })
  bitrateKbps: number | null;

  @Column({ name: 'channels', type: 'smallint', nullable: true })
  channels: number | null;

  @Column({ name: 'sample_rate_hz', type: 'int', nullable: true })
  sampleRateHz: number | null;

  /** NULL = 모름(백필 행). 앱이 "약 140MB" 표시에 쓴다 */
  @Column({ name: 'byte_size', type: 'bigint', nullable: true })
  byteSize: string | null;

  @Column({ name: 'duration_sec', type: 'int' })
  durationSec: number;
}
