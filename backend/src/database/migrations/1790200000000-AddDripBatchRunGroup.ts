import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `drip_batch_runs.group` (domain.md 7.3, 2026-10-14 — KAN-191).
 *
 * 글로벌 시장은 발송 그룹(asia·europe·americas)마다 현지 05:00에 편성하므로 하루에 그룹 수만큼 실행이 생긴다.
 * 중복 실행 방지 유니크를 `(run_date)`에서 `(run_date, group)`으로 넓힌다. 기존 행은 전부 05:00 KST 배치라 `asia`다.
 */
export class AddDripBatchRunGroup1790200000000 implements MigrationInterface {
  name = 'AddDripBatchRunGroup1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "drip_batch_runs" ADD "group" character varying(16) NOT NULL DEFAULT 'asia'`,
    );
    await queryRunner.query(
      `ALTER TABLE "drip_batch_runs" DROP CONSTRAINT "uq_drip_batch_runs_run_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drip_batch_runs" ADD CONSTRAINT "uq_drip_batch_runs_run_date_group" UNIQUE ("run_date", "group")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 그룹 실행 행은 되돌린 스키마에 담을 자리가 없다 — 기본 그룹 행만 남긴다
    await queryRunner.query(
      `DELETE FROM "drip_batch_runs" WHERE "group" <> 'asia'`,
    );
    await queryRunner.query(
      `ALTER TABLE "drip_batch_runs" DROP CONSTRAINT "uq_drip_batch_runs_run_date_group"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drip_batch_runs" ADD CONSTRAINT "uq_drip_batch_runs_run_date" UNIQUE ("run_date")`,
    );
    await queryRunner.query(
      `ALTER TABLE "drip_batch_runs" DROP COLUMN "group"`,
    );
  }
}
