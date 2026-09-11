import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `drip_batch_runs.exhausted_count` (domain.md 7.3, 2026-09-11).
 *
 * 편성 대상이었으나 후보 고갈로 0편이 된 사용자 수. 배치는 이 값을 처음부터 세고 있었지만
 * 컬럼이 없어 로그에만 남겼다(orchestrator "exhaustedCount는 저장하지 않는다"). 2026-09-11 실서버
 * 배치가 대상 13 · 성공 3 · 건너뜀 0 · 실패 0으로 기록돼 나머지 10명이 어디로 갔는지 표만으로는
 * 알 수 없었다 — 콘텐츠가 모자라서 못 준 사용자 수는 수급 판단의 직접 신호라 컬럼으로 올린다.
 * 기존 행은 0 — 그날의 고갈 수는 로그에서만 복원할 수 있다.
 */
export class AddDripBatchRunExhaustedCount1787300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "drip_batch_runs" ADD "exhausted_count" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "drip_batch_runs" DROP COLUMN "exhausted_count"`,
    );
  }
}
