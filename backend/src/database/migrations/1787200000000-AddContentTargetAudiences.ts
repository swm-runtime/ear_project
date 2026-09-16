import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 추천 메타 5종째 + 메타 형식 버전 기록 (domain.md 5.1, 2026-09-11).
 *
 * - `target_audiences` jsonb — 이 콘텐츠가 맞는 (직군, 연차 구간) 세트. `drip-scheduling.md` 4.2 ③
 *   "커리어 적합도" 행이 문서에만 있고 코드에 없던 이유가 콘텐츠 쪽 대조 상대가 없어서였다.
 * - `enrichment_schema_version` · `enriched_at` — 어떤 형식의 `enrichment.json`이 언제 적용됐는지.
 *   형식이 바뀔 때(이번이 1 → 2) 구형 메타로 남은 콘텐츠를 어드민이 골라 다시 뽑게 하는 근거다.
 *   기존 행은 NULL — "메타 파일을 받은 적 없음"과 "구형(1)으로 받음"을 이 마이그레이션이 구분할 수
 *   없어 둘 다 NULL로 두고, 재부여 대상은 "2 미만 또는 NULL"로 본다.
 */
export class AddContentTargetAudiences1787200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "target_audiences" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "enrichment_schema_version" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "enriched_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contents" DROP COLUMN "enriched_at"`);
    await queryRunner.query(
      `ALTER TABLE "contents" DROP COLUMN "enrichment_schema_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" DROP COLUMN "target_audiences"`,
    );
  }
}
