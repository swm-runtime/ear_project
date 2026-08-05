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

import { User } from './user.entity';
import { DevicePlatform } from '../user.enum';

/**
 * domain.md 3.6 — 푸시 토큰과 **OS 알림 권한 상태**.
 *
 * 권한 상태는 `user_settings`가 아니라 여기에만 존재한다 —
 * 사용자 단위가 아니라 **기기 단위 값**이기 때문이다(B-1).
 *
 * `token`을 nullable로 둔 것은 `onboarding-api.md` 4.9가 **권한 거부 시 `push_token: null`**
 * 을 보내도록 확정했기 때문이다. 거부했을 때도 호출하지 않으면 서버가 "거부"와
 * "아직 안 물어봄"을 구분할 수 없다. domain.md 3.6은 이 컬럼에 NULL 표기가 없어
 * 문서 정리가 필요하다(작업 보고 참조).
 */
@Entity('device_tokens')
@Unique('uq_device_tokens_user_id_device_id', ['userId', 'deviceId'])
@Index('idx_device_tokens_user_id', ['userId'])
export class DeviceToken extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_device_tokens_users',
  })
  user: User;

  @Column({ name: 'device_id', type: 'varchar', length: 255 })
  deviceId: string;

  /** null = 권한이 거부돼 발급받지 못함. 만들어 낸 토큰을 넣지 않는다 */
  @Column({ name: 'token', type: 'varchar', length: 512, nullable: true })
  token: string | null;

  @Column({ name: 'platform', type: 'varchar', length: 20 })
  platform: DevicePlatform;

  @Column({ name: 'is_os_permission_granted', type: 'boolean' })
  isOsPermissionGranted: boolean;

  @Column({ name: 'app_version', type: 'varchar', length: 20 })
  appVersion: string;

  @Column({ name: 'invalidated_at', type: 'timestamptz', nullable: true })
  invalidatedAt: Date | null;
}
