import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * domain.md 1.1 — 모든 테이블이 갖는 공통 컬럼.
 * convention.md 4.2 — `created_at` · `updated_at`은 BaseEntity로 공통화한다.
 */
export abstract class BaseEntity {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
