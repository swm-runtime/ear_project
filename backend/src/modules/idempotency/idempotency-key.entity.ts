import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { IdempotencyStatus } from './idempotency.enum';

/**
 * domain.md 1.4 — 같은 `Idempotency-Key` 재요청에 **저장된 첫 응답을 그대로 반환**하기 위한 테이블.
 *
 * `user_id` FK를 두지 않는다. 가입은 계정이 생기기 전 호출이라 참조할 행이 없고,
 * NULL을 허용하면 Postgres가 NULL을 서로 다른 값으로 봐 유니크 제약이 동작하지 않는다.
 */
@Entity('idempotency_keys')
@Unique('uq_idempotency_keys_owner_key_endpoint_idempotency_key', [
  'ownerKey',
  'endpoint',
  'idempotencyKey',
])
@Index('idx_idempotency_keys_expires_at', ['expiresAt'])
export class IdempotencyKey extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 인증 요청은 `user:<user_id>`, 인증 전(가입)은 `anonymous` */
  @Column({ name: 'owner_key', type: 'varchar', length: 100 })
  ownerKey: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255 })
  idempotencyKey: string;

  /** 메서드 + 경로. 같은 키를 다른 엔드포인트에 재사용해도 응답이 섞이지 않게 한다 */
  @Column({ name: 'endpoint', type: 'varchar', length: 255 })
  endpoint: string;

  /** 같은 키에 다른 본문이면 재요청으로 보지 않는다 */
  @Column({ name: 'request_hash', type: 'varchar', length: 128 })
  requestHash: string;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: IdempotencyStatus;

  @Column({ name: 'response_status', type: 'smallint', nullable: true })
  responseStatus: number | null;

  /**
   * 완료된 요청의 응답 본문 **원문**. 204처럼 본문이 없으면 null.
   * `jsonb`는 키 순서·공백을 정규화해 "그대로 반환"이 깨지므로 문자열로 보관한다 (domain.md 1.4).
   */
  @Column({ name: 'response_body', type: 'text', nullable: true })
  responseBody: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
