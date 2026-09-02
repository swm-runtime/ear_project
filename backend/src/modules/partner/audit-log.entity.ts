import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

/**
 * domain.md 10.3 — 관리자 행위의 감사 근거. 파트너 분쟁·결제 변경 대응의 유일한 기록이다.
 *
 * `partner` 모듈 소유다(domain.md 2장). 파트너 테이블 자체는 아직 없고, 관리자 화면
 * (`admin.md` 4.1)이 모든 행위를 여기 남겨야 해서 이 엔티티부터 만든다.
 *
 * 검수 완료 확인(체크)의 이행 증적도 이 테이블이 담당한다 — 업로드 기록의
 * `actor` · `created_at` · `after`(검수 확인 입력값 포함)가 그대로 증적이다(domain.md 5.1).
 */
@Entity('audit_logs')
@Index('idx_audit_logs_target_created_at', ['target', 'createdAt'])
export class AuditLog extends BaseEntity {
  /** 대량 로그성 테이블이라 bigserial이다 (domain.md 1.1 예외 조항) */
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** 행위자 — 관리자 `users.id` */
  @Column({ name: 'actor', type: 'varchar', length: 100 })
  actor: string;

  /** 예: `content.upload` · `topic.update` */
  @Column({ name: 'action', type: 'varchar', length: 100 })
  action: string;

  /** 대상 식별자 — 예: `content:<uuid>` · `topic:<uuid>` */
  @Column({ name: 'target', type: 'varchar', length: 255 })
  target: string;

  @Column({ name: 'before', type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ name: 'after', type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;
}
