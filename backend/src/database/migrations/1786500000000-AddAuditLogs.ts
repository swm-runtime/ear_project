import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 10.3 — `audit_logs`. 관리자 화면(admin.md 4.1)의 모든 행위가 여기 남는다.
 * 검수 완료 확인의 이행 증적도 이 테이블이 담당한다(domain.md 5.1).
 */
export class AddAuditLogs1786500000000 implements MigrationInterface {
  name = 'AddAuditLogs1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"         BIGSERIAL PRIMARY KEY,
        "actor"      character varying(100) NOT NULL,
        "action"     character varying(100) NOT NULL,
        "target"     character varying(255) NOT NULL,
        "before"     jsonb,
        "after"      jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_target_created_at" ON "audit_logs" ("target", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
