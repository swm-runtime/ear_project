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
 * domain.md 6.5 — 서명 URL **발급 사실만** 기록한다(B-4 결정).
 *
 * **`signed_url`을 저장하지 않는다.** 서명 URL을 DB에 남기면 그 자체가 유출 경로가 된다
 * (`architecture.md` 9.4 — 협상 대상이 아닌 규칙). 이 테이블은 FR-33 무단 재배포 방지의
 * 이상 탐지·감사 근거이지 URL 보관소가 아니다.
 *
 * PK가 `bigserial`인 것은 대량 로그성 테이블이기 때문이다(convention.md 4.2 예외 조항) —
 * 재생 한 번에 갱신까지 여러 건이 쌓인다.
 */
@Entity('audio_access_logs')
@Index('idx_audio_access_logs_content_id_issued_at', ['contentId', 'issuedAt'])
@Index('idx_audio_access_logs_user_id_issued_at', ['userId', 'issuedAt'])
export class AudioAccessLog extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content)
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_audio_access_logs_contents',
  })
  content: Content;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_audio_access_logs_users',
  })
  user: User;

  /** 클라이언트가 보낸 기기 식별자(`player-api.md` 4.1). 이상 탐지의 축이다 */
  @Column({ name: 'device_id', type: 'varchar', length: 200 })
  deviceId: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /**
   * 원문이 아니라 해시다. 대량 다운로드 패턴을 같은 출처로 묶는 데는 동일성만 필요하고,
   * IP는 개인식별정보라 원문으로 남기지 않는다(architecture.md 9.7).
   *
   * 프록시 뒤라 주소를 얻지 못하는 경우가 있어 `null`을 허용한다.
   */
  @Column({ name: 'ip_hash', type: 'varchar', length: 64, nullable: true })
  ipHash: string | null;
}
